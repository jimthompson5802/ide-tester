"""Private bounded worker entry. Native frameworks load only during dispatch."""
from pathlib import Path

from ide_smoke.adapters.base import LifecycleError


def _metadata(executable):
    import os
    import plistlib
    import json
    executable = Path(executable)
    contents = executable.parent.parent
    try:
        metadata = plistlib.loads((contents / 'Info.plist').read_bytes())
        if (executable.parent.name != 'MacOS' or contents.name != 'Contents'
                or contents.parent.suffix.casefold() != '.app'
                or metadata['CFBundleIdentifier'] != 'com.microsoft.VSCode'
                or metadata['CFBundleExecutable'] != executable.name
                or executable.is_symlink() or not os.access(executable, os.X_OK)):
            raise ValueError
        with executable.open('rb') as source:
            if source.read(4) not in (b'\xcf\xfa\xed\xfe', b'\xca\xfe\xba\xbe', b'\xca\xfe\xba\xbf'):
                raise ValueError
    except Exception:
        raise LifecycleError('unsupported_launcher') from None
    try:
        import re
        version = metadata['CFBundleShortVersionString']
        product = json.loads((contents / 'Resources' / 'app' / 'product.json').read_bytes())
        if (not isinstance(version, str) or re.fullmatch(r'[0-9A-Za-z.+-]{1,64}', version) is None
                or product['version'] != version):
            raise ValueError
    except Exception:
        raise LifecycleError('version_unavailable') from None
    return {'executable': str(executable), 'bundle_identifier': 'com.microsoft.VSCode', 'version': version}


def _native_worker(request):
    """Native data stays inside this worker; never return raw titles or argv of foreign processes."""
    import ctypes as C
    import os
    import struct
    import sys
    if sys.platform != 'darwin':
        raise LifecycleError('native_prerequisite_missing')
    if request['kind'] == 'metadata':
        return _metadata(request['executable'])
    lib = C.CDLL('/usr/lib/libproc.dylib', use_errno=True)
    libc = C.CDLL(None, use_errno=True)

    class BSD(C.Structure):
        _fields_ = [(name, C.c_uint32) for name in (
            'flags', 'status', 'xstatus', 'pid', 'ppid', 'uid', 'gid', 'ruid', 'rgid', 'svuid', 'svgid', 'rfu')]
        _fields_ += [('comm', C.c_char * 16), ('name', C.c_char * 32)]
        _fields_ += [(name, C.c_uint32) for name in ('nfiles', 'pgid', 'pjobc', 'tdev', 'tpgid')]
        _fields_ += [('nice', C.c_int32), ('sec', C.c_uint64), ('usec', C.c_uint64)]

    lib.proc_pidinfo.argtypes = [C.c_int, C.c_int, C.c_uint64, C.c_void_p, C.c_int]
    lib.proc_pidinfo.restype = C.c_int
    lib.proc_pidpath.argtypes = [C.c_int, C.c_void_p, C.c_uint32]
    lib.proc_pidpath.restype = C.c_int
    lib.proc_listpids.argtypes = [C.c_uint32, C.c_uint32, C.c_void_p, C.c_int]
    lib.proc_listpids.restype = C.c_int
    libc.sysctl.argtypes = [C.POINTER(C.c_int), C.c_uint, C.c_void_p, C.POINTER(C.c_size_t), C.c_void_p, C.c_size_t]
    libc.sysctl.restype = C.c_int
    if C.sizeof(BSD) != 136 or BSD.sec.offset != 120 or BSD.usec.offset != 128:
        raise LifecycleError('ownership_uncertain')

    def info(pid):
        row = BSD()
        size = lib.proc_pidinfo(pid, 3, 0, C.byref(row), C.sizeof(row))
        if not size:
            if C.get_errno() == 3:  # ESRCH; no process, never adopt a replacement.
                return None
            raise LifecycleError('ownership_uncertain')
        if size != C.sizeof(row) or row.pid != pid:
            raise LifecycleError('ownership_uncertain')
        return row

    def birth(row):
        return f'{row.sec}:{row.usec}'

    def path(pid):
        buffer = C.create_string_buffer(4096)
        if lib.proc_pidpath(pid, buffer, len(buffer)) <= 0:
            raise LifecycleError('ownership_uncertain')
        return os.fsdecode(buffer.value)

    def argv(pid):
        # KERN_PROCARGS2: argc followed by executable/padding then argc strings.
        # Stop after argv; never decode or return the environment tail.
        mib = (C.c_int * 3)(1, 49, pid)
        buffer = C.create_string_buffer(1024 * 1024)
        length = C.c_size_t(len(buffer))
        if libc.sysctl(mib, 3, buffer, C.byref(length), None, 0) != 0:
            raise LifecycleError('ownership_uncertain')
        raw = buffer.raw[:length.value]
        count = struct.unpack_from('i', raw)[0]
        if not 0 < count < 4096:
            raise LifecycleError('ownership_uncertain')
        offset = raw.index(b'\0', 4) + 1
        while offset < len(raw) and raw[offset] == 0:
            offset += 1
        result = []
        for _ in range(count):
            end = raw.index(b'\0', offset)
            result.append(os.fsdecode(raw[offset:end]))
            offset = end + 1
        return result

    def token(pid):
        first = info(pid)
        if first is None:
            raise LifecycleError('early_exit')
        executable, arguments = path(pid), argv(pid)
        last = info(pid)
        if last is None or birth(first) != birth(last):
            raise LifecycleError('ownership_uncertain')
        return {'pid': pid, 'birth': birth(first), 'executable': executable, 'argv': arguments}

    kind = request['kind']
    if kind not in {'identity', 'preflight', 'regular_snapshot', 'snapshot', 'exited', 'observe', 'terminate', 'application_state'}:
        raise LifecycleError('ownership_uncertain')
    if kind == 'identity':
        return token(request['pid'])

    if kind in ('preflight', 'regular_snapshot'):
        import AppKit
        import ApplicationServices as AX
    if kind == 'regular_snapshot':
        import hashlib
        def attr(element, name):
            error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
            if error:
                raise LifecycleError('ownership_uncertain')
            return value
        snapshots = []
        for app in AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_('com.microsoft.VSCode'):
            pid = app.processIdentifier()
            if pid == request['exclude_pid']:
                continue
            before = info(pid)
            application = AX.AXUIElementCreateApplication(pid)
            AX.AXUIElementSetMessagingTimeout(application, .2)
            rows = []
            for window in list(attr(application, 'AXWindows') or []):
                position_ok, position = AX.AXValueGetValue(attr(window, 'AXPosition'), AX.kAXValueCGPointType, None)
                size_ok, size = AX.AXValueGetValue(attr(window, 'AXSize'), AX.kAXValueCGSizeType, None)
                if not position_ok or not size_ok:
                    raise LifecycleError('ownership_uncertain')
                rows.append({'title_sha256': hashlib.sha256((request['salt'] + str(attr(window, 'AXTitle'))).encode()).hexdigest(),
                             'position': [position.x, position.y], 'size': [size.width, size.height],
                             'minimized': bool(attr(window, 'AXMinimized'))})
            after = info(pid)
            if before is None or after is None or birth(before) != birth(after):
                raise LifecycleError('ownership_uncertain')
            snapshots.append({'pid': pid, 'birth': birth(before), 'windows': sorted(rows, key=lambda row: row['title_sha256'])})
        return {'applications': sorted(snapshots, key=lambda app: app['pid'])}
    if kind == 'preflight':
        if not AX.AXIsProcessTrusted() or AppKit.NSWorkspace.sharedWorkspace().frontmostApplication() is None:
            raise LifecycleError('native_prerequisite_missing')
        candidates_pids = {app.processIdentifier() for app in
                           AppKit.NSRunningApplication.runningApplicationsWithBundleIdentifier_('com.microsoft.VSCode')}
        supplemental_births = {}
        if request.get('executable'):
            # PROC_UID_ONLY=4, qualified against local SDK sys/proc_info.h.
            # Direct launches need not appear in AppKit's application registry.
            # Inspect argv only after the same-user executable matches selection.
            needed = lib.proc_listpids(4, os.getuid(), None, 0)
            if needed <= 0 or needed > 4 * 1024 * 1024:
                raise LifecycleError('ownership_uncertain')
            pids = (C.c_int * (needed // 4 + 256))()
            actual = lib.proc_listpids(4, os.getuid(), pids, C.sizeof(pids))
            if actual <= 0 or actual >= C.sizeof(pids) or actual % 4:
                raise LifecycleError('ownership_uncertain')
            selected = Path(request['executable'])
            for candidate in pids[:actual // 4]:
                if candidate <= 0 or candidate in candidates_pids:
                    continue
                before = info(candidate)
                if before is None or before.status == 5:
                    continue
                if before.uid != os.getuid():
                    raise LifecycleError('ownership_uncertain')
                executable = Path(path(candidate))
                matches = (executable.resolve() == selected.resolve()
                           or (executable.exists() and executable.samefile(selected)))
                after = info(candidate)
                if after is None or birth(before) != birth(after):
                    raise LifecycleError('ownership_uncertain')
                if matches:
                    candidates_pids.add(candidate)
                    supplemental_births[candidate] = birth(before)
        for candidate in candidates_pids:
            current = token(candidate)
            if candidate in supplemental_births:
                current_executable = Path(current['executable'])
                if (current['birth'] != supplemental_births[candidate]
                        or not (current_executable.resolve() == selected.resolve()
                                or (current_executable.exists() and current_executable.samefile(selected)))):
                    raise LifecycleError('ownership_uncertain')
            arguments = current['argv']
            if arguments and arguments[-1] == '--user-data-dir':
                raise LifecycleError('ownership_uncertain')
            profile = str(Path(request['profile']) / 'user-data')
            candidates = [value.partition('=')[2] for value in arguments if value.startswith('--user-data-dir=')]
            candidates += [arguments[index + 1] for index, value in enumerate(arguments[:-1]) if value == '--user-data-dir']
            if any(not value or not Path(value).is_absolute() for value in candidates):
                raise LifecycleError('ownership_uncertain')
            if any(Path(value).resolve() == Path(profile).resolve() or
                   (Path(value).exists() and Path(value).samefile(profile)) for value in candidates):
                raise LifecycleError('profile_busy')
        return {'prerequisites_observed': True}

    pid = request['pid']
    main = info(pid)
    if main is not None and birth(main) != request['birth']:
        raise LifecycleError('ownership_uncertain')
    if main is not None and main.status != 5:
        current = token(pid)
        if current['executable'] != request['executable'] or current['argv'] != request['argv']:
            raise LifecycleError('ownership_uncertain')

    # Session membership supplements a birth-qualified descendant ledger. Never
    # signal a process group or independently terminate a helper.
    needed = lib.proc_listpids(1, 0, None, 0)
    if needed <= 0 or needed > 4 * 1024 * 1024:
        raise LifecycleError('ownership_uncertain')
    pids = (C.c_int * (needed // 4 + 256))()
    actual = lib.proc_listpids(1, 0, pids, C.sizeof(pids))
    if actual <= 0 or actual >= C.sizeof(pids):
        raise LifecycleError('ownership_uncertain')
    ledger = dict(request.get('ledger', {}))
    live = []
    for child in pids[:actual // 4]:
        if child <= 0:
            continue
        try:
            same_session = os.getsid(child) == pid
        except ProcessLookupError:
            continue
        except PermissionError:
            same_session = False
        known = str(child) in ledger
        if not same_session and not known:
            continue
        row = info(child)
        if row is None:
            continue
        if known and ledger[str(child)] != birth(row):
            # A replacement in our session may still use the workspace. Never
            # silently drop it from the completion check or adopt it for killing.
            if same_session:
                raise LifecycleError('ownership_uncertain')
            continue
        ledger[str(child)] = birth(row)
        if row.status != 5:
            live.append(child)
    for known_pid, known_birth in ledger.items():
        row = info(int(known_pid))
        if row is not None and birth(row) == known_birth and row.status != 5 and int(known_pid) not in live:
            live.append(int(known_pid))
    if kind in ('snapshot', 'exited'):
        # Pure native process inspection: synthetic lifecycle tests need no
        # AppKit, GUI session, Accessibility trust, or graphical application.
        return {'exited': not live and (main is None or main.status == 5), 'ledger': ledger}
    if main is None or main.status == 5:
        if kind == 'application_state':
            return {'application_ready': False, 'ledger': ledger}
        if kind == 'terminate':
            return {'ledger': ledger}
        return {'observation': {'live': False}, 'ledger': ledger}

    import AppKit
    import ApplicationServices as AX

    def owned_app():
        # Run after the process scan and again immediately before any mutation.
        # No PID-only/native-path-only authority survives an intervening scan.
        current = token(pid)
        if (current['birth'] != request['birth']
                or current['executable'] != request['executable']
                or current['argv'] != request['argv']):
            raise LifecycleError('ownership_uncertain', stage='application_identity')
        owner = info(pid)
        if (owner is None or owner.ppid != os.getppid()
                or os.getsid(pid) != pid):
            # Only this worker's live controller may mutate the child it
            # directly spawned. Serialized tokens never grant cleanup power.
            raise LifecycleError('ownership_uncertain', stage='application_identity')
        app = AppKit.NSRunningApplication.runningApplicationWithProcessIdentifier_(pid)
        if app is not None:
            if (app.isTerminated() or app.executableURL() is None
                    or str(app.executableURL().path()) != request['executable']):
                raise LifecycleError('ownership_uncertain', stage='application_identity')
            seconds, micros = (int(part) for part in request['birth'].split(':'))
            # Kernel birth is mandatory. AppKit launch date is corroborating metadata
            # and is unavailable for the observed directly launched native process.
            launch_date = app.launchDate()
            if launch_date is not None:
                import math
                launch_seconds = float(launch_date.timeIntervalSince1970())
                if not math.isfinite(launch_seconds) or abs(launch_seconds - (seconds + micros / 1_000_000)) > .001:
                    raise LifecycleError('ownership_uncertain', stage='application_identity')
        after = token(pid)
        if after != current:
            raise LifecycleError('ownership_uncertain', stage='application_identity')
        owner = info(pid)
        if owner is None or owner.ppid != os.getppid() or os.getsid(pid) != pid:
            raise LifecycleError('ownership_uncertain', stage='application_identity')
        return app

    def pending_registration():
        if kind == 'terminate':
            return {'termination_pending': True, 'ledger': ledger}
        return {'observation': {'live': True, 'matching_windows': 0,
                'workspace_matches': True, 'workbench': False, 'obstruction': None}, 'ledger': ledger}

    app = owned_app()
    if kind == 'application_state':
        return {'application_ready': app is not None and bool(app.isFinishedLaunching()), 'ledger': ledger}
    if app is None:
        return pending_registration()
    if kind == 'terminate':
        app = owned_app()
        if app is None:
            return pending_registration()
        if not app.terminate():
            raise LifecycleError('ownership_uncertain')
        return {'ledger': ledger}

    application = AX.AXUIElementCreateApplication(pid)
    AX.AXUIElementSetMessagingTimeout(application, .2)
    if owned_app() is None:
        return pending_registration()
    if request.get('enable_ax', True):
        if AX.AXUIElementSetAttributeValue(application, 'AXManualAccessibility', True) != 0:
            raise LifecycleError('ownership_uncertain', stage='ax_exposure')

    def attribute(element, name):
        error, value = AX.AXUIElementCopyAttributeValue(element, name, None)
        if error in (-25205, -25212):  # unsupported attribute / no value
            return None
        if error:
            raise LifecycleError('ownership_uncertain', stage='ax_attribute')
        return value

    windows = list(attribute(application, 'AXWindows') or [])
    titles = [str(attribute(w, 'AXTitle') or '') for w in windows]
    workspace_name = Path(request['workspace']).name
    matching = [w for w, title in zip(windows, titles) if workspace_name in title.split(' — ')]
    generic_title_only = bool(titles) and all(title in ('', 'Visual Studio Code', 'Welcome', 'Welcome — Visual Studio Code') for title in titles)
    obstruction = None
    roles = set()
    queue = list(windows)
    count = 0
    while queue and count < 600:
        node = queue.pop(0)
        role = attribute(node, 'AXRole')
        subrole = attribute(node, 'AXSubrole')
        roles.add(role)
        if subrole == 'AXSystemDialog':
            obstruction = 'unknown_dialog'
        elif (role == 'AXSheet' or subrole == 'AXDialog'
              or bool(attribute(node, 'AXModal'))):
            if obstruction is None:
                obstruction = 'modal'
        queue.extend(list(attribute(node, 'AXChildren') or []))
        count += 1
    # Exhausting the traversal cannot prove absence of an obstruction.
    if queue:
        raise LifecycleError('ownership_uncertain', stage='tree_traversal')
    return {'accessibility_exposed': True,
            'window_facts': {'workspace_name_present': any(workspace_name in title for title in titles),
                            'generic_title_only': generic_title_only,
                            'restricted_mode_suffix': any('[Restricted Mode]' in title for title in titles),
                            'has_web_area': 'AXWebArea' in roles, 'has_outline': 'AXOutline' in roles,
                            'has_toolbar': 'AXToolbar' in roles, 'has_tab_group': 'AXTabGroup' in roles},
            'observation': {'live': True, 'matching_windows': len(matching),
                           'workspace_matches': not windows or len(matching) == len(windows),
                           'workbench': {'AXWebArea', 'AXOutline', 'AXToolbar'} <= roles,
                           'initializing': generic_title_only,
                           'obstruction': obstruction}, 'ledger': ledger}



def main():
    import json
    import sys
    try:
        request = json.load(sys.stdin)
        result = _native_worker(request)
    except LifecycleError as error:
        result = {'error': error.reason.value, 'stage': error.stage}
    except Exception:
        result = {'error': 'ownership_uncertain'}
    print(json.dumps(result))


if __name__ == '__main__':
    main()
