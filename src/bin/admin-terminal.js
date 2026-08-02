// ===== ADMIN BROWSER TERMINAL =====
// SSH-style terminal emulator for admin operations
var TERMINAL_COMMANDS = {
    help: {
        description: 'Show available commands',
        usage: 'help [command]',
        handler: cmdHelp
    },
    users: {
        description: 'Manage registered users',
        usage: 'users [list|revoke <id>]',
        handler: cmdUsers
    },
    admins: {
        description: 'Manage admin accounts',
        usage: 'admins [list|create <username>|revoke <id>|rotate <id>]',
        handler: cmdAdmins
    },
    logs: {
        description: 'View system logs',
        usage: 'logs [show [n]|clear]',
        handler: cmdLogs
    },
    whoami: {
        description: 'Show current session info',
        usage: 'whoami',
        handler: cmdWhoami
    },
    clear: {
        description: 'Clear terminal screen',
        usage: 'clear',
        handler: cmdClear
    },
    exit: {
        description: 'Close the terminal',
        usage: 'exit',
        handler: cmdExit
    }
};
var terminalHistory = [];
var historyIndex = -1;
var currentLine = '';
// ===== TERMINAL INITIALIZATION =====
function initAdminTerminal() {
    var terminalEl = document.getElementById('adminTerminal');
    if (!terminalEl)
        return;
    var output = document.getElementById('terminalOutput');
    var input = document.getElementById('terminalInput');
    // Welcome message
    printLine(output, '\x1b[32m╔══════════════════════════════════════════════════════════════╗\x1b[0m');
    printLine(output, '\x1b[32m║  \x1b[1mNoteBooks-Test Admin Terminal\x1b[0m\x1b[32m                              ║\x1b[0m');
    printLine(output, '\x1b[32m║  SSH-style administration interface                          ║\x1b[0m');
    printLine(output, '\x1b[32m╚══════════════════════════════════════════════════════════════╝\x1b[0m');
    printLine(output, '');
    printLine(output, 'Type \x1b[33mhelp\x1b[0m for available commands.');
    printLine(output, '');
    // Focus input
    input.focus();
    // Handle input
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            var cmd = input.value.trim();
            if (cmd) {
                terminalHistory.push(cmd);
                historyIndex = terminalHistory.length;
                executeCommand(cmd, output);
            }
            input.value = '';
        }
        else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (historyIndex > 0) {
                historyIndex--;
                input.value = terminalHistory[historyIndex];
            }
        }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (historyIndex < terminalHistory.length - 1) {
                historyIndex++;
                input.value = terminalHistory[historyIndex];
            }
            else {
                historyIndex = terminalHistory.length;
                input.value = '';
            }
        }
    });
    // Click anywhere in terminal focuses input
    terminalEl.addEventListener('click', function () { return input.focus(); });
}
// ===== COMMAND EXECUTION =====
function executeCommand(cmdLine, output) {
    var session = SSHAuth.getSession();
    var username = (session === null || session === void 0 ? void 0 : session.username) || 'guest';
    // Echo command
    printLine(output, "\u001B[32m".concat(username, "@notebooks\u001B[0m:\u001B[34m~\u001B[0m$ ").concat(cmdLine));
    var parts = cmdLine.split(/\s+/);
    var cmd = parts[0].toLowerCase();
    var args = parts.slice(1);
    if (TERMINAL_COMMANDS[cmd]) {
        try {
            TERMINAL_COMMANDS[cmd].handler(args, output);
        }
        catch (error) {
            printLine(output, "\u001B[31mError: ".concat(error.message, "\u001B[0m"));
        }
    }
    else {
        printLine(output, "\u001B[31mCommand not found: ".concat(cmd, "\u001B[0m"));
        printLine(output, 'Type \x1b[33mhelp\x1b[0m for available commands.');
    }
    printLine(output, '');
    // Scroll to bottom
    output.scrollTop = output.scrollHeight;
}
// ===== OUTPUT HELPERS =====
function printLine(output, text) {
    var line = document.createElement('div');
    line.innerHTML = parseAnsiColors(text);
    output.appendChild(line);
}
function parseAnsiColors(text) {
    var colorMap = {
        '30': 'color:#1e293b',
        '31': 'color:#ef4444',
        '32': 'color:#10b981',
        '33': 'color:#f59e0b',
        '34': 'color:#3b82f6',
        '35': 'color:#8b5cf6',
        '36': 'color:#14b8a6',
        '37': 'color:#f1f5f9',
        '1': 'font-weight:bold',
        '0': ''
    };
    var result = text;
    result = result.replace(/\x1b\[([0-9;]+)m/g, function (match, codes) {
        var styles = codes.split(';').map(function (c) { return colorMap[c] || ''; }).filter(Boolean);
        if (styles.length === 0 || codes === '0') {
            return '</span>';
        }
        return "<span style=\"".concat(styles.join(';'), "\">");
    });
    return result;
}
// ===== COMMAND HANDLERS =====
function cmdHelp(args, output) {
    if (args.length > 0) {
        var cmd = args[0].toLowerCase();
        if (TERMINAL_COMMANDS[cmd]) {
            printLine(output, "\u001B[1m".concat(cmd, "\u001B[0m - ").concat(TERMINAL_COMMANDS[cmd].description));
            printLine(output, "Usage: ".concat(TERMINAL_COMMANDS[cmd].usage));
        }
        else {
            printLine(output, "\u001B[31mUnknown command: ".concat(cmd, "\u001B[0m"));
        }
        return;
    }
    printLine(output, '\x1b[1mAvailable Commands:\x1b[0m');
    printLine(output, '');
    Object.entries(TERMINAL_COMMANDS).forEach(function (_a) {
        var name = _a[0], info = _a[1];
        var padding = ' '.repeat(Math.max(0, 12 - name.length));
        printLine(output, "  \u001B[33m".concat(name, "\u001B[0m").concat(padding).concat(info.description));
    });
}
function cmdUsers(args, output) {
    var _a;
    if (!SSHAuth.isAdmin()) {
        printLine(output, '\x1b[31mPermission denied. Admin access required.\x1b[0m');
        return;
    }
    var action = ((_a = args[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'list';
    if (action === 'list') {
        var users = SSHAuth.getUsers();
        if (users.length === 0) {
            printLine(output, '\x1b[33mNo registered users.\x1b[0m');
            return;
        }
        printLine(output, '\x1b[1mRegistered Users:\x1b[0m');
        printLine(output, '─'.repeat(70));
        printLine(output, "  \u001B[1mID".concat(' '.repeat(34), "USERNAME").concat(' '.repeat(8), "FINGERPRINT\u001B[0m"));
        printLine(output, '─'.repeat(70));
        users.forEach(function (u) {
            var _a;
            var date = new Date(u.createdAt).toLocaleDateString();
            printLine(output, "  ".concat(u.id.slice(0, 8), "...  ").concat(u.username.padEnd(14), " ").concat(((_a = u.fingerprint) === null || _a === void 0 ? void 0 : _a.slice(0, 20)) || 'N/A', "..."));
        });
    }
    else if (action === 'revoke') {
        var userId_1 = args[1];
        if (!userId_1) {
            printLine(output, '\x1b[31mUsage: users revoke <user_id>\x1b[0m');
            return;
        }
        var users = SSHAuth.getUsers();
        var user = users.find(function (u) { return u.id.startsWith(userId_1); });
        if (!user) {
            printLine(output, "\u001B[31mUser not found: ".concat(userId_1, "\u001B[0m"));
            return;
        }
        SSHAuth.revokeUser(user.id);
        SSHAuth.log('user_revoked', { userId: user.id, username: user.username });
        printLine(output, "\u001B[32mUser ".concat(user.username, " (").concat(user.id.slice(0, 8), "...) revoked successfully.\u001B[0m"));
    }
    else {
        printLine(output, '\x1b[31mUsage: users [list|revoke <id>]\x1b[0m');
    }
}
function cmdAdmins(args, output) {
    var _a;
    if (!SSHAuth.isAdmin()) {
        printLine(output, '\x1b[31mPermission denied. Admin access required.\x1b[0m');
        return;
    }
    var action = ((_a = args[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'list';
    if (action === 'list') {
        var admins = SSHAuth.getAdmins();
        if (admins.length === 0) {
            printLine(output, '\x1b[33mNo admin accounts.\x1b[0m');
            return;
        }
        printLine(output, '\x1b[1mAdmin Accounts:\x1b[0m');
        printLine(output, '─'.repeat(70));
        admins.forEach(function (a) {
            var _a;
            var perms = ((_a = a.permissions) === null || _a === void 0 ? void 0 : _a.join(', ')) || 'none';
            printLine(output, "  \u001B[32m".concat(a.username, "\u001B[0m (").concat(a.id.slice(0, 8), "...)"));
            printLine(output, "    Fingerprint: ".concat(a.fingerprint || 'N/A'));
            printLine(output, "    Permissions: ".concat(perms));
        });
    }
    else if (action === 'create') {
        var username_1 = args[1];
        if (!username_1) {
            printLine(output, '\x1b[31mUsage: admins create <username>\x1b[0m');
            return;
        }
        printLine(output, "\u001B[33mGenerating key pair for admin: ".concat(username_1, "...\u001B[0m"));
        SSHAuth.registerAdmin(username_1).then(function (result) {
            printLine(output, '\x1b[32mAdmin account created successfully!\x1b[0m');
            printLine(output, '');
            printLine(output, '\x1b[1;31m*** SAVE THE PRIVATE KEY BELOW - THIS IS THE ONLY TIME IT WILL BE SHOWN ***\x1b[0m');
            printLine(output, '');
            printLine(output, "Fingerprint: \u001B[33m".concat(result.fingerprint, "\u001B[0m"));
            printLine(output, '');
            printLine(output, '\x1b[36m' + result.privateKey + '\x1b[0m');
            SSHAuth.log('admin_created', { username: username_1, fingerprint: result.fingerprint });
            output.scrollTop = output.scrollHeight;
        }).catch(function (err) {
            printLine(output, "\u001B[31mError: ".concat(err.message, "\u001B[0m"));
        });
    }
    else if (action === 'revoke') {
        var adminId_1 = args[1];
        if (!adminId_1) {
            printLine(output, '\x1b[31mUsage: admins revoke <admin_id>\x1b[0m');
            return;
        }
        var admins = SSHAuth.getAdmins();
        var admin = admins.find(function (a) { return a.id.startsWith(adminId_1); });
        if (!admin) {
            printLine(output, "\u001B[31mAdmin not found: ".concat(adminId_1, "\u001B[0m"));
            return;
        }
        var session = SSHAuth.getSession();
        if (admin.id === (session === null || session === void 0 ? void 0 : session.id)) {
            printLine(output, '\x1b[31mCannot revoke your own admin account.\x1b[0m');
            return;
        }
        SSHAuth.revokeAdmin(admin.id);
        SSHAuth.log('admin_revoked', { adminId: admin.id, username: admin.username });
        printLine(output, "\u001B[32mAdmin ".concat(admin.username, " revoked successfully.\u001B[0m"));
    }
    else if (action === 'rotate') {
        var adminId_2 = args[1];
        if (!adminId_2) {
            printLine(output, '\x1b[31mUsage: admins rotate <admin_id>\x1b[0m');
            return;
        }
        var admins = SSHAuth.getAdmins();
        var admin_1 = admins.find(function (a) { return a.id.startsWith(adminId_2); });
        if (!admin_1) {
            printLine(output, "\u001B[31mAdmin not found: ".concat(adminId_2, "\u001B[0m"));
            return;
        }
        printLine(output, "\u001B[33mRotating key for admin: ".concat(admin_1.username, "...\u001B[0m"));
        SSHAuth.rotateKey(admin_1.id).then(function (result) {
            printLine(output, '\x1b[32mKey rotated successfully!\x1b[0m');
            printLine(output, '');
            printLine(output, '\x1b[1;31m*** SAVE THE NEW PRIVATE KEY BELOW ***\x1b[0m');
            printLine(output, '');
            printLine(output, "New Fingerprint: \u001B[33m".concat(result.fingerprint, "\u001B[0m"));
            printLine(output, '');
            printLine(output, '\x1b[36m' + result.privateKey + '\x1b[0m');
            SSHAuth.log('key_rotated', { username: admin_1.username, newFingerprint: result.fingerprint });
            output.scrollTop = output.scrollHeight;
        }).catch(function (err) {
            printLine(output, "\u001B[31mError: ".concat(err.message, "\u001B[0m"));
        });
    }
    else {
        printLine(output, '\x1b[31mUsage: admins [list|create <username>|revoke <id>|rotate <id>]\x1b[0m');
    }
}
function cmdLogs(args, output) {
    var _a;
    if (!SSHAuth.isAdmin()) {
        printLine(output, '\x1b[31mPermission denied. Admin access required.\x1b[0m');
        return;
    }
    var action = ((_a = args[0]) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || 'show';
    if (action === 'show') {
        var limit = parseInt(args[1]) || 20;
        var logs = SSHAuth.getLogs(limit);
        if (logs.length === 0) {
            printLine(output, '\x1b[33mNo log entries.\x1b[0m');
            return;
        }
        printLine(output, "\u001B[1mLast ".concat(logs.length, " Log Entries:\u001B[0m"));
        printLine(output, '─'.repeat(70));
        logs.forEach(function (log) {
            var time = new Date(log.timestamp).toLocaleString();
            var actionColor = log.action.includes('error') ? '31' :
                log.action.includes('login') ? '32' :
                    log.action.includes('logout') ? '33' : '36';
            printLine(output, "\u001B[90m".concat(time, "\u001B[0m \u001B[").concat(actionColor, "m").concat(log.action, "\u001B[0m \u001B[37m").concat(log.user, "\u001B[0m"));
        });
    }
    else if (action === 'clear') {
        SSHAuth.clearLogs();
        SSHAuth.log('logs_cleared', {});
        printLine(output, '\x1b[32mLogs cleared.\x1b[0m');
    }
    else {
        printLine(output, '\x1b[31mUsage: logs [show [n]|clear]\x1b[0m');
    }
}
function cmdWhoami(args, output) {
    var _a;
    var session = SSHAuth.getSession();
    if (!session) {
        printLine(output, '\x1b[33mNot authenticated.\x1b[0m');
        return;
    }
    printLine(output, '\x1b[1mCurrent Session:\x1b[0m');
    printLine(output, "  Username:    \u001B[32m".concat(session.username, "\u001B[0m"));
    printLine(output, "  Role:        \u001B[33m".concat(session.role, "\u001B[0m"));
    printLine(output, "  Fingerprint: \u001B[36m".concat(session.fingerprint || 'N/A', "\u001B[0m"));
    printLine(output, "  Permissions: \u001B[35m".concat(((_a = session.permissions) === null || _a === void 0 ? void 0 : _a.join(', ')) || 'none', "\u001B[0m"));
    if (session.expiresAt) {
        var remaining = Math.max(0, session.expiresAt - Date.now());
        var hours = Math.floor(remaining / (60 * 60 * 1000));
        var mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
        printLine(output, "  Expires in:  \u001B[90m".concat(hours, "h ").concat(mins, "m\u001B[0m"));
    }
}
function cmdClear(args, output) {
    output.innerHTML = '';
}
function cmdExit(args, output) {
    hideAdminTerminal();
}
// ===== TERMINAL OVERLAY =====
function showAdminTerminal() {
    if (!SSHAuth.isAdmin()) {
        showStatus('Admin access required');
        return;
    }
    var overlay = document.getElementById('terminalOverlay');
    if (!overlay)
        return;
    overlay.style.display = 'flex';
    requestAnimationFrame(function () {
        overlay.classList.add('active');
        initAdminTerminal();
    });
}
function hideAdminTerminal() {
    var overlay = document.getElementById('terminalOverlay');
    if (!overlay)
        return;
    overlay.classList.remove('active');
    setTimeout(function () {
        overlay.style.display = 'none';
    }, 380);
}
// Export
if (typeof window !== 'undefined') {
    window.showAdminTerminal = showAdminTerminal;
    window.hideAdminTerminal = hideAdminTerminal;
}
