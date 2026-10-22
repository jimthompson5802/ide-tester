"""Opt-in bounded editor worker; importing never loads native frameworks."""
from pathlib import Path
from ide_smoke.adapters.base import LifecycleError
from ide_smoke.platforms.macos.vscode_session import NativeBackend

ROLES = frozenset({'AXWindow', 'AXTextArea', 'AXTextField', 'AXButton', 'AXTabGroup',
                   'AXRadioButton', 'AXStaticText', 'AXWebArea', 'AXOutline', 'AXToolbar', 'AXComboBox'})
COUNTS = frozenset({'window_count', 'node_count', 'target_document_matches',
                    'target_description_matches', 'editor_count', 'focused_editor_count',
                    'open_menu_count', 'save_menu_count'})


class StaleObservation(LifecycleError):
    """An invalid AX element invalidated the entire read-only snapshot."""
    def __init__(self):
        super().__init__('ownership_uncertain', stage='ax_attribute')


def observe_owned(request, *, observe, clock=None, sleep=None):
    """Reacquire complete snapshots for at most .4 seconds after stale AX data."""
    import time
    clock, sleep = clock or time.monotonic, sleep or time.sleep
    until = clock() + .4
    for attempt in range(9):
        try:
            return observe(request)
        except StaleObservation:
            remaining = until - clock()
            if remaining <= 0 or attempt == 8:
                raise
            sleep(min(.05, remaining))


def focused_target(facts):
    """An exact active document and its owned focused editor are both mandatory."""
    return (facts.get('exact_document') is True and facts.get('owned_window') is True
            and facts.get('focused') is True and facts.get('role') == 'AXTextArea')


def activate_menu_command(open_menu, select_item, press_item):
    """Select a native menu command only after opening its parent menu."""
    error = open_menu()
    if error:
        return error
    return press_item(select_item())


def guarded_key_pair(check, send, *, settle=None):
    """A single down/up pair; revalidate immediately before each delivery."""
    for down in (True, False):
        check()
        send(down)
    if settle is not None:
        settle(.2)


def quick_open_target(facts):
    return (facts.get('role') in ('AXTextField', 'AXComboBox')
            and all(facts.get(key) is True for key in ('owned_window', 'quick_open_label', 'empty')))


def confirm_focus(confirm, *, clock=None, sleep=None):
    """Bounded readback only; the caller sets focus exactly once beforehand."""
    import time
    clock, sleep = clock or time.monotonic, sleep or time.sleep
    until = clock() + .5
    for attempt in range(11):
        if confirm():
            return True
        remaining = until - clock()
        if remaining <= 0 or attempt == 10:
            return False
        sleep(min(.05, remaining))


def press_and_confirm(press, confirm):
    """One supported scoped action, with no confirmation after refusal."""
    if press() != 0:
        return False
    return confirm_focus(confirm)


def _attribute_error(name, error):
    """Persist only fixed attribute names and numeric errors in ignored evidence."""
    import json
    import os
    allowed = {'AXWindows', 'AXTitle', 'AXRole', 'AXSubrole', 'AXModal', 'AXChildren',
               'AXDocument', 'AXDescription', 'AXFocused', 'AXValue', 'AXEdited', 'AXMenuBar',
               'AXWindow', 'AXFocusedUIElement', 'AXPlaceholderValue', 'AXSelected', 'AXEnabled', 'AXFocusedWindow'}
    if name not in allowed:
        return
    diagnostic = Path(__file__).resolve().parents[3] / '.ide-smoke/m1-05/attribute-errors.jsonl'
    diagnostic.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(diagnostic, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, (json.dumps({'attribute': name, 'error': int(error)}) + '\n').encode())
    finally:
        os.close(fd)


def _open_checkpoint(step, **facts):
    """Callers supply fixed steps, booleans, and allowlisted structural counts."""
    import json
    import os
    diagnostic = Path(__file__).resolve().parents[3] / '.ide-smoke/m1-05/open-checkpoints.jsonl'
    diagnostic.parent.mkdir(parents=True, exist_ok=True)
    fd = os.open(diagnostic, os.O_WRONLY | os.O_APPEND | os.O_CREAT | os.O_NOFOLLOW, 0o600)
    try:
        os.write(fd, (json.dumps(dict(step=step, **facts)) + '\n').encode())
    finally:
        os.close(fd)


class ProbeBackend(NativeBackend):
    def __init__(self, **kwargs):
        import sys
        kwargs.setdefault('_coexistence', True)
        super().__init__(_worker_command=(sys.executable, str(Path(__file__).resolve()), '--worker'), **kwargs)
        self.discovery = None
        self.last_error = None

    def _call(self, request, deadline):
        try:
            return super()._call(request, deadline)
        except LifecycleError as error:
            self.last_error = dict(reason=error.reason.value, stage=error.stage,
                                   kind=request['kind'], action=request.get('action'))
            raise

    @staticmethod
    def _validate_reply(request, result):
        if request['kind'] == 'editor_new':
            valid = (isinstance(result, dict)
                     and result.keys() == {'action', 'owned', 'document', 'editor_focused', 'content', 'dirty', 'performed'}
                     and result['action'] == request['action']
                     and result['document'] in ('untitled', 'target', 'other', 'unknown')
                     and result['content'] in ('empty', 'edited', 'other', 'unknown')
                     and all(type(result[key]) is bool for key in ('owned', 'editor_focused', 'performed'))
                     and (result['dirty'] is None or type(result['dirty']) is bool)
                     and result['performed'] is (request['action'] != 'inspect'))
            if not valid:
                raise LifecycleError('ownership_uncertain')
            return
        if request['kind'] != 'editor':
            return NativeBackend._validate_reply(request, result)
        valid = isinstance(result, dict) and result.get('action') == request['action']
        if request['action'] == 'discover':
            valid = (valid and result.keys() == COUNTS | {'action', 'owned', 'role_counts', 'screen_reader_optimized'}
                     and type(result['owned']) is bool and result['owned']
                     and type(result['screen_reader_optimized']) is bool
                     and all(type(result[k]) is int and 0 <= result[k] <= 1600 for k in COUNTS)
                     and isinstance(result['role_counts'], dict) and not result['role_counts'].keys() - ROLES
                     and all(type(v) is int and 0 <= v <= 1600 for v in result['role_counts'].values()))
        else:
            valid = (valid and result.keys() == {'action', 'owned', 'target_active', 'editor_focused', 'content', 'dirty', 'performed'}
                     and all(type(result[k]) is bool for k in ('owned', 'target_active', 'editor_focused', 'performed'))
                     and result['content'] in ('original', 'edited', 'other', 'unknown')
                     and (result['dirty'] is None or type(result['dirty']) is bool)
                     and result['performed'] is (request['action'] != 'inspect'))
        if not valid:
            raise LifecycleError('ownership_uncertain')

    def exchange(self, session, action, target, deadline):
        new_flow = target == self.spec.workspace / 'created.py'
        actions = {'new', 'inspect', 'enter', 'save_as'} if new_flow else {'open', 'inspect', 'replace', 'save', 'discover'}
        if (action not in actions or session.spec is not self.spec
                or session.identity is None or target != self.spec.workspace / 'example.py'):
            if not (new_flow and action in actions and session.spec is self.spec and session.identity is not None):
                raise LifecycleError('ownership_uncertain')
        request = self._request('observe', session.identity)
        request.update(kind='editor_new' if new_flow else 'editor', action=action, target=str(target), enable_ax=False)
        result = self._call(request, deadline)
        return result

    def discover(self, session, target, deadline):
        self.discovery = self.exchange(session, 'discover', target, deadline)
        return self.discovery


def dispatch(request, *, execute=None):
    """Route a worker request; only complete read-only requests may replay."""
    execute = execute or _dispatch
    if request.get('kind') in ('editor', 'editor_new') and request.get('action') in {'discover', 'inspect'}:
        return observe_owned(request, observe=execute)
    return execute(request)


def _dispatch(request):
    from ide_smoke.platforms.macos.vscode_worker import _native_worker
    if request.get('kind') not in ('editor', 'editor_new'):
        return _native_worker(request)
    new_flow = request['kind'] == 'editor_new'
    action = request.get('action')
    workspace, target = Path(request.get('workspace', '')), Path(request.get('target', ''))
    actions = {'new', 'inspect', 'enter', 'save_as'} if new_flow else {'discover', 'open', 'inspect', 'replace', 'save'}
    if (action not in actions
            or not workspace.is_absolute() or '..' in workspace.parts
            or target != workspace / ('created.py' if new_flow else 'example.py') or request.get('enable_ax') is not False):
        raise LifecycleError('ownership_uncertain')
    observe_request = {k: v for k, v in request.items() if k not in {'action', 'target'}}
    observe_request['kind'] = 'observe'

    def native_observe(observation_request):
        import ApplicationServices as AX
        original = AX.AXUIElementCopyAttributeValue
        stale = False
        def diagnostic_attribute(element, name, output):
            nonlocal stale
            error, value = original(element, name, output)
            stale = stale or error == -25202
            if error and error not in (-25205, -25212):
                _attribute_error(name, error)
            return error, value
        AX.AXUIElementCopyAttributeValue = diagnostic_attribute
        try:
            try:
                return _native_worker(observation_request)
            except LifecycleError as error:
                if stale and error.stage == 'ax_attribute':
                    raise StaleObservation() from None
                raise
        finally:
            AX.AXUIElementCopyAttributeValue = original

    def ownership():
        result = observe_owned(observe_request, observe=native_observe)
        facts = result['observation']
        if (not facts.get('live') or facts.get('matching_windows') != 1
                or not facts.get('workspace_matches') or facts.get('obstruction') is not None):
            raise LifecycleError('ownership_uncertain')
    ownership()
    import AppKit
    import ApplicationServices as AX
    import Quartz
    import time
    from urllib.parse import unquote, urlparse
    pid = request['pid']
    application = AX.AXUIElementCreateApplication(pid)
    AX.AXUIElementSetMessagingTimeout(application, .2)

    def attr(element, name):
        error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
        if error in (-25205, -25212):
            return None
        if error:
            _attribute_error(name, error)
            if error == -25202:
                raise StaleObservation()
            raise LifecycleError('ownership_uncertain', stage='ax_attribute')
        return value

    def tree(root):
        queue, nodes = [root], []
        while queue and len(nodes) < 1600:
            node = queue.pop(0)
            nodes.append(node)
            queue.extend(list(attr(node, 'AXChildren') or []))
        if queue:
            raise LifecycleError('ownership_uncertain', stage='tree_traversal')
        return nodes

    windows = list(attr(application, 'AXWindows') or [])
    matching = [w for w in windows if workspace.name in str(attr(w, 'AXTitle') or '').split(' — ')]
    if len(windows) != 1 or len(matching) != 1:
        raise LifecycleError('ownership_uncertain', stage='window_association')
    window = matching[0]

    def foreground():
        ownership()
        front = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
        if front is None or front.processIdentifier() != pid:
            raise LifecycleError('ownership_uncertain')

    def key(code, flags=0, text=None, editor=None):
        for down in (True, False):
            foreground()
            if editor is not None and not attr(editor, 'AXFocused'):
                raise LifecycleError('ownership_uncertain')
            event = Quartz.CGEventCreateKeyboardEvent(None, code, down)
            if event is None:
                raise LifecycleError('ownership_uncertain')
            Quartz.CGEventSetFlags(event, flags)
            if text is not None:
                Quartz.CGEventKeyboardSetUnicodeString(event, len(text), text)
            Quartz.CGEventPostToPid(pid, event)

    def exact_document(node):
        value = str(attr(node, 'AXDocument') or '')
        return value == str(target) or (value.startswith('file://') and unquote(urlparse(value).path) == str(target))

    if new_flow:
        if action == 'new':
            if target.exists() or target.is_symlink():
                raise LifecycleError('ownership_uncertain')
            ownership()
            app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
            if app is None or not app.activateWithOptions_(AppKit.NSApplicationActivateIgnoringOtherApps):
                raise LifecycleError('ownership_uncertain')
            AX.AXUIElementPerformAction(window, 'AXRaise')
            def check_new_destination():
                foreground()
                if attr(application, 'AXFocusedWindow') != window:
                    raise LifecycleError('ownership_uncertain')
            def send_new_key(down):
                event = Quartz.CGEventCreateKeyboardEvent(None, 45, down)
                if event is None:
                    raise LifecycleError('ownership_uncertain')
                Quartz.CGEventSetFlags(event, Quartz.kCGEventFlagMaskCommand)
                Quartz.CGEventPost(Quartz.kCGSessionEventTap, event)
            # Foreground checks and event delivery are separate OS operations.
            # The reserved desktop remains necessary for their residual race.
            def settle_sender(seconds):
                import Foundation
                Foundation.NSRunLoop.currentRunLoop().runUntilDate_(
                    Foundation.NSDate.dateWithTimeIntervalSinceNow_(seconds))
            guarded_key_pair(check_new_destination, send_new_key, settle=settle_sender)
            _open_checkpoint('new_session_key_sent', use_session_input=True,
                             residual_focus_delivery_race=True, sender_settle_seconds=.2)
            return dict(action=action, owned=True, document='unknown', editor_focused=False,
                        content='unknown', dirty=None, performed=True)
        import re
        document_value = str(attr(window, 'AXDocument') or '')
        title = str(attr(window, 'AXTitle') or '').split(' — ')[0]
        untitled = re.fullmatch(r'Untitled-[1-9][0-9]*', title) is not None and (
            not document_value or document_value.startswith('untitled:'))
        document = 'target' if exact_document(window) else 'untitled' if untitled else 'other'
        editor = attr(application, 'AXFocusedUIElement')
        role = attr(editor, 'AXRole') if editor is not None else None
        focused = bool(editor is not None and role == 'AXTextArea'
                       and attr(editor, 'AXWindow') == window and attr(editor, 'AXFocused'))
        if not focused:
            editors = [node for node in tree(window) if attr(node, 'AXRole') == 'AXTextArea'
                       and attr(node, 'AXWindow') == window]
            editor = editors[0] if len(editors) == 1 else None
        value = attr(editor, 'AXValue') if editor is not None else None
        content = 'empty' if value in ('', '\n') else 'edited' if value == 'message = "edited by ide-smoke"\n' else 'unknown' if value is None else 'other'
        dirty_value = attr(window, 'AXEdited')
        dirty = bool(dirty_value) if dirty_value is not None else None
        title_full = str(attr(window, 'AXTitle') or '')
        def untitled_label(value):
            return re.fullmatch(r'Untitled-[1-9][0-9]*', value) is not None
        category = ('absent' if not document_value else 'untitled' if document_value.startswith('untitled:')
                    else 'file' if document_value.startswith('file:') else 'other')
        relevant = []
        for node in tree(window):
            node_title = str(attr(node, 'AXTitle') or '')
            node_description = str(attr(node, 'AXDescription') or '')
            role_value = attr(node, 'AXRole')
            known_labels = (node_title + ' ' + node_description).casefold()
            if not (role_value == 'AXTextArea' or 'untitled' in known_labels
                    or untitled_label(node_title) or untitled_label(node_description)
                    or node_title == 'created.py' or node_description == 'created.py'
                    or re.search(r'Untitled-[1-9][0-9]*', node_title + ' ' + node_description)):
                continue
            selected_error, selected = AX.AXUIElementCopyAttributeValue(node, 'AXSelected', None)
            primitive = attr(node, 'AXValue')
            relevant.append(dict(role=role_value if role_value in ROLES else 'other',
                                 contains_untitled='untitled' in known_labels,
                                 title_contains_untitled='untitled' in node_title.casefold(),
                                 description_contains_untitled='untitled' in node_description.casefold(),
                                 editor_content_label='editor content' in known_labels,
                                 chat_input_label='chat input' in known_labels,
                                 chat_label='chat' in known_labels,
                                 title_exact_untitled=untitled_label(node_title),
                                 description_exact_untitled=untitled_label(node_description),
                                 title_is_target=node_title == 'created.py', description_is_target=node_description == 'created.py',
                                 selected_error=int(selected_error),
                                 selected=bool(selected) if not selected_error else None,
                                 primitive_value=primitive if type(primitive) in (bool, int) else None,
                                 unsaved_marker=any(word in (node_title + ' ' + node_description).casefold() for word in ('unsaved', 'dirty')),
                                 owned_window=attr(node, 'AXWindow') == window))
        _open_checkpoint('new_editor_structure', title_exact_untitled=untitled_label(title),
                         title_contains_untitled=bool(re.search(r'Untitled-[1-9][0-9]*', title_full)),
                         title_contains_untitled_any_case='untitled' in title_full.casefold(),
                         document_category=category,
                         document_is_workspace=(document_value == str(workspace) or (document_value.startswith('file:')
                             and unquote(urlparse(document_value).path) == str(workspace))),
                         document_is_target=exact_document(window), relevant=relevant)
        _open_checkpoint('new_editor_inspected', document=document, focused=focused, content=content,
                         dirty=dirty, focused_role=role if role in ROLES else 'other')
        if action != 'inspect':
            raise LifecycleError('ownership_uncertain')
        return dict(action=action, owned=True, document=document, editor_focused=focused,
                    content=content, dirty=dirty, performed=False)

    def snapshot():
        nodes = tree(window)
        documents = [node for node in nodes if exact_document(node)]
        descriptions = [node for node in nodes if str(target) in str(attr(node, 'AXDescription') or '')]
        editors = [node for node in nodes if attr(node, 'AXRole') == 'AXTextArea']
        focused = [node for node in editors if bool(attr(node, 'AXFocused'))]
        return nodes, documents, descriptions, editors, focused

    if action == 'discover':
        nodes, documents, descriptions, editors, focused = snapshot()
        bar = attr(application, 'AXMenuBar')
        menu = tree(bar) if bar is not None else []
        counts = {role: sum(attr(n, 'AXRole') == role for n in nodes) for role in ROLES}
        return dict(action=action, owned=True, window_count=len(windows), node_count=len(nodes),
                    role_counts=counts, target_document_matches=len(documents),
                    target_description_matches=len(descriptions), editor_count=len(editors),
                    focused_editor_count=len(focused),
                    screen_reader_optimized=any('Screen Reader Optimized' in str(attr(n, 'AXDescription') or '') for n in nodes),
                    open_menu_count=sum(attr(n, 'AXTitle') in ('Open…', 'Open File…') for n in menu),
                    save_menu_count=sum(attr(n, 'AXTitle') == 'Save' for n in menu))
    if action == 'open':
        _open_checkpoint('begin')
        ownership()
        app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
        if app is None or not app.activateWithOptions_(AppKit.NSApplicationActivateIgnoringOtherApps):
            _open_checkpoint('activation_failed')
            raise LifecycleError('ownership_uncertain')
        _open_checkpoint('activation_requested')
        AX.AXUIElementPerformAction(window, 'AXRaise')
        until = time.monotonic() + .5
        while time.monotonic() < until:
            front = AppKit.NSWorkspace.sharedWorkspace().frontmostApplication()
            if front and front.processIdentifier() == pid:
                break
            time.sleep(.02)
        key(35, Quartz.kCGEventFlagMaskCommand)  # Quick Open
        _open_checkpoint('quick_open_sent')
        until = time.monotonic() + .7
        while time.monotonic() < until:
            candidate = attr(application, 'AXFocusedUIElement')
            fields = ([candidate] if candidate is not None and attr(candidate, 'AXRole') in ('AXTextField', 'AXComboBox')
                      and attr(candidate, 'AXFocused') and attr(candidate, 'AXWindow') == window else [])
            if len(fields) == 1:
                break
            time.sleep(.02)
        else:
            try:
                summary_nodes = tree(window)
                role_counts, focused_counts = {}, {}
                candidates, field_facts = [], []
                for node in summary_nodes:
                    role = attr(node, 'AXRole')
                    if role in ROLES:
                        role_counts[role] = role_counts.get(role, 0) + 1
                        if attr(node, 'AXFocused'):
                            focused_counts[role] = focused_counts.get(role, 0) + 1
                    if role in ('AXTextField', 'AXComboBox'):
                        labels = [str(attr(node, name) or '') for name in ('AXTitle', 'AXDescription', 'AXPlaceholderValue')]
                        known = any(value.startswith('Search files by name') or value == 'Go to File' for value in labels)
                        facts = dict(role=role, owned_window=attr(node, 'AXWindow') == window,
                                     quick_open_label=known, empty=attr(node, 'AXValue') in (None, ''))
                        field_facts.append(facts)
                        if quick_open_target(facts):
                            candidates.append(node)
                _open_checkpoint('field_timeout', role_counts=role_counts, focused_counts=focused_counts)
                _open_checkpoint('quick_open_candidates', fields=field_facts)
                if len(candidates) == 1:
                    foreground()
                    field = candidates[0]
                    actions_error, actions = AX.AXUIElementCopyActionNames(field, None)
                    focus_attribute_error, focus_attribute = AX.AXUIElementCopyAttributeValue(field, 'AXFocused', None)
                    _open_checkpoint('quick_open_focus_capabilities',
                                     actions_error=int(actions_error),
                                     has_press=bool(not actions_error and 'AXPress' in (actions or [])),
                                     has_confirm=bool(not actions_error and 'AXConfirm' in (actions or [])),
                                     focus_attribute_error=int(focus_attribute_error),
                                     focus_attribute_true=bool(not focus_attribute_error and focus_attribute))
                    focus_error = None
                    def focus_readback():
                        foreground()
                        if (attr(field, 'AXWindow') != window
                                or attr(field, 'AXRole') not in ('AXTextField', 'AXComboBox')
                                or attr(field, 'AXValue') not in (None, '')):
                            raise LifecycleError('ownership_uncertain')
                        return bool(attr(field, 'AXFocused'))
                    def press_field():
                        nonlocal focus_error
                        foreground()
                        labels = [str(attr(field, name) or '') for name in ('AXTitle', 'AXDescription', 'AXPlaceholderValue')]
                        facts = dict(role=attr(field, 'AXRole'), owned_window=attr(field, 'AXWindow') == window,
                                     quick_open_label=any(value.startswith('Search files by name') or value == 'Go to File' for value in labels),
                                     empty=attr(field, 'AXValue') in (None, ''))
                        if actions_error or 'AXPress' not in (actions or []) or not quick_open_target(facts):
                            raise LifecycleError('ownership_uncertain')
                        focus_error = AX.AXUIElementPerformAction(field, 'AXPress')
                        return focus_error
                    focused_after = press_and_confirm(press_field, focus_readback)
                    _open_checkpoint('quick_open_focus_result', error=int(focus_error), focused=focused_after)
                    if focus_error == 0 and focused_after:
                        fields = [field]
                        _open_checkpoint('quick_open_focus_verified')
            except LifecycleError:
                _open_checkpoint('field_timeout_inspection_failed')
            if not fields:
                _open_checkpoint('input_focus_unqualified')
                raise LifecycleError('ownership_uncertain')
        _open_checkpoint('field_found')
        foreground()
        field = fields[0]
        if AX.AXUIElementSetAttributeValue(field, 'AXValue', str(target)):
            _open_checkpoint('path_set_failed')
            raise LifecycleError('ownership_uncertain')
        if attr(field, 'AXValue') != str(target) or not attr(field, 'AXFocused'):
            _open_checkpoint('path_readback_failed')
            raise LifecycleError('ownership_uncertain')
        _open_checkpoint('path_verified')
        key(36, editor=field)
        _open_checkpoint('enter_sent')
        return dict(action=action, owned=True, target_active=False, editor_focused=False,
                    content='unknown', dirty=None, performed=True)
    candidate = attr(application, 'AXFocusedUIElement')
    facts = dict(exact_document=exact_document(window), owned_window=False, focused=False, role=None)
    if candidate is not None:
        facts.update(owned_window=attr(candidate, 'AXWindow') == window,
                     focused=bool(attr(candidate, 'AXFocused')), role=attr(candidate, 'AXRole'))
    active = focused_target(facts)
    editor = candidate if active else None
    focus = active
    value = attr(editor, 'AXValue') if editor is not None else None
    content = {'message = "original fixture"\n': 'original', 'message = "edited by ide-smoke"\n': 'edited'}.get(value, 'unknown' if value is None else 'other')
    dirty_value = attr(window, 'AXEdited')
    dirty = bool(dirty_value) if dirty_value is not None else None
    if action != 'inspect':
        raise LifecycleError('ownership_uncertain')
    return dict(action=action, owned=True, target_active=active, editor_focused=focus,
                content=content, dirty=dirty, performed=False)


def main():
    import json
    import sys
    try:
        result = dispatch(json.load(sys.stdin))
    except LifecycleError as error:
        result = {'error': error.reason.value, 'stage': error.stage}
    except Exception:
        result = {'error': 'ownership_uncertain'}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
