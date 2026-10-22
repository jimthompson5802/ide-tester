"""Strict opt-in worker boundary checks; native execution is never invoked."""
import importlib.util
from pathlib import Path
import pytest
from ide_smoke.adapters.base import LifecycleError


def load_worker():
    spec = importlib.util.spec_from_file_location('editor_worker', Path(__file__).parents[2] / 'scripts/spikes/m1_05/editor_worker.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_editor_reply_rejects_unknown_fields_and_coerced_boolean():
    worker = load_worker()
    request = {'kind': 'editor', 'action': 'inspect'}
    reply = dict(action='inspect', owned=True, target_active=True, editor_focused=True,
                 content='original', dirty=False, performed=False)
    worker.ProbeBackend._validate_reply(request, reply)
    for changes in ({'owned': 1}, {'raw_title': 'private'}, {'content': 'private'}, {'action': 'save'}):
        with pytest.raises(LifecycleError):
            worker.ProbeBackend._validate_reply(request, reply | changes)


def test_invalid_editor_target_is_rejected_before_native_access():
    worker = load_worker()
    with pytest.raises(LifecycleError):
        worker.dispatch({'kind': 'editor', 'action': 'open', 'workspace': '/owned',
                         'target': '/foreign/example.py'})


def test_discovery_reply_accepts_only_bounded_structural_facts():
    worker = load_worker()
    reply = dict(action='discover', owned=True, role_counts={'AXTextArea': 1}, screen_reader_optimized=False,
                 **{key: 0 for key in worker.COUNTS})
    worker.ProbeBackend._validate_reply({'kind': 'editor', 'action': 'discover'}, reply)
    for changes in ({'node_count': True}, {'role_counts': {'private': 1}}, {'raw_value': 'private'}):
        with pytest.raises(LifecycleError):
            worker.ProbeBackend._validate_reply({'kind': 'editor', 'action': 'discover'}, reply | changes)


def test_owned_snapshot_reacquires_after_stale_element_without_relaxing_result():
    worker = load_worker()
    calls = []
    result = {'observation': {'live': True, 'matching_windows': 1, 'workspace_matches': True, 'obstruction': None}}
    def observe(request):
        calls.append(request)
        if len(calls) == 1:
            raise worker.StaleObservation()
        return result
    request = {'kind': 'observe'}
    assert worker.observe_owned(request, observe=observe, clock=lambda: 0, sleep=lambda _: None) is result
    assert calls == [request, request]


def test_owned_snapshot_retry_is_bounded_and_other_failures_are_immediate():
    worker = load_worker()
    now = [0.0]
    calls = []
    def observe(request):
        calls.append(request)
        raise worker.StaleObservation()
    def sleep(seconds):
        now[0] += seconds
    with pytest.raises(LifecycleError):
        worker.observe_owned({}, observe=observe, clock=lambda: now[0], sleep=sleep)
    assert now[0] <= .4
    assert 1 < len(calls) <= 10
    calls.clear()
    def uncertain(request):
        calls.append(request)
        raise LifecycleError('ownership_uncertain')
    with pytest.raises(LifecycleError):
        worker.observe_owned({}, observe=uncertain, clock=lambda: 0, sleep=sleep)
    assert len(calls) == 1


def test_worker_retries_only_read_only_requests_after_stale_snapshot():
    worker = load_worker()
    for action in ('discover', 'inspect', 'open', 'replace', 'save'):
        calls = []
        def execute(request):
            calls.append(request)
            if len(calls) == 1:
                raise worker.StaleObservation()
            return {'safe': True}
        request = {'kind': 'editor', 'action': action}
        if action in ('discover', 'inspect'):
            assert worker.dispatch(request, execute=execute) == {'safe': True}
            assert len(calls) == 2
        else:
            with pytest.raises(worker.StaleObservation):
                worker.dispatch(request, execute=execute)
            assert len(calls) == 1


def test_target_editor_requires_exact_document_owned_window_and_focused_textarea():
    worker = load_worker()
    facts = dict(exact_document=True, owned_window=True, focused=True, role='AXTextArea')
    assert worker.focused_target(facts)
    for change in ({'exact_document': False}, {'owned_window': False}, {'focused': False}, {'role': 'AXTextField'}):
        assert not worker.focused_target(facts | change)


def test_quick_open_field_requires_known_label_empty_value_and_owned_window():
    worker = load_worker()
    facts = dict(role='AXTextField', owned_window=True, quick_open_label=True, empty=True)
    assert worker.quick_open_target(facts)
    for change in ({'role': 'AXTextArea'}, {'owned_window': False}, {'quick_open_label': False}, {'empty': False}):
        assert not worker.quick_open_target(facts | change)


def test_focus_confirmation_polls_async_readback_without_repeating_setter():
    worker = load_worker()
    values = iter((False, False, True))
    now = [0.0]
    checks = []
    def confirm():
        checks.append(True)
        return next(values)
    def sleep(seconds):
        now[0] += seconds
    assert worker.confirm_focus(confirm, clock=lambda: now[0], sleep=sleep)
    assert len(checks) == 3
    assert now[0] <= .5


def test_focus_confirmation_stops_at_deadline():
    worker = load_worker()
    now = [0.0]
    def sleep(seconds):
        now[0] += seconds
    assert not worker.confirm_focus(lambda: False, clock=lambda: now[0], sleep=sleep)
    assert now[0] <= .5


def test_supported_focus_action_runs_once_then_confirms_or_stops_on_refusal():
    worker = load_worker()
    calls = []
    def action():
        calls.append('press')
        return 0
    def confirm():
        calls.append('confirm')
        return calls.count('confirm') == 2
    assert worker.press_and_confirm(action, confirm)
    assert calls == ['press', 'confirm', 'confirm']
    calls.clear()
    def refuse():
        calls.append('press')
        return -25204
    assert not worker.press_and_confirm(refuse, confirm)
    assert calls == ['press']


def test_new_workflow_reply_requires_explicit_document_and_known_content():
    worker = load_worker()
    request = {'kind': 'editor_new', 'action': 'inspect'}
    reply = dict(action='inspect', owned=True, document='untitled', editor_focused=True,
                 content='empty', dirty=False, performed=False)
    worker.ProbeBackend._validate_reply(request, reply)
    for changes in ({'document': 'foreign.py'}, {'content': 'private'}, {'owned': 1}, {'target_active': True}):
        with pytest.raises(LifecycleError):
            worker.ProbeBackend._validate_reply(request, reply | changes)


def test_visible_native_menu_sequence_requires_menu_open_before_item_action():
    worker = load_worker()
    calls = []
    def open_menu():
        calls.append('menu')
        return 0
    def select():
        calls.append('select')
        return 'qualified-item'
    def press(item):
        assert item == 'qualified-item'
        calls.append('item')
        return 0
    assert worker.activate_menu_command(open_menu, select, press) == 0
    assert calls == ['menu', 'select', 'item']
    calls.clear()
    assert worker.activate_menu_command(lambda: -25204, select, press) == -25204
    assert calls == []


def test_guarded_keyboard_pair_rechecks_before_each_event_and_never_replays():
    worker = load_worker()
    calls = []
    def check():
        calls.append('check')
    worker.guarded_key_pair(check, lambda down: calls.append(down))
    assert calls == ['check', True, 'check', False]
    calls.clear()
    def unsafe():
        raise LifecycleError('ownership_uncertain')
    with pytest.raises(LifecycleError):
        worker.guarded_key_pair(unsafe, lambda down: calls.append(down))
    assert calls == []
    checks = [True, False]
    def loses_focus():
        if not checks.pop(0):
            raise LifecycleError('ownership_uncertain')
    with pytest.raises(LifecycleError):
        worker.guarded_key_pair(loses_focus, lambda down: calls.append(down))
    assert calls == [True]


def test_keyboard_delivery_settles_once_after_complete_pair_without_replay():
    worker = load_worker()
    events = []
    worker.guarded_key_pair(lambda: events.append('check'), lambda down: events.append(down),
                            settle=lambda seconds: events.append(('settle', seconds)))
    assert events == ['check', True, 'check', False, ('settle', .2)]
