// ===== ADMIN BROWSER TERMINAL =====
// SSH-style terminal emulator for admin operations

const TERMINAL_COMMANDS = {
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

let terminalHistory = [];
let historyIndex = -1;
let currentLine = '';

// ===== TERMINAL INITIALIZATION =====
function initAdminTerminal() {
  const terminalEl = document.getElementById('adminTerminal');
  if (!terminalEl) return;
  
  const output = document.getElementById('terminalOutput');
  const input = document.getElementById('terminalInput');
  
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
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const cmd = input.value.trim();
      if (cmd) {
        terminalHistory.push(cmd);
        historyIndex = terminalHistory.length;
        executeCommand(cmd, output);
      }
      input.value = '';
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex > 0) {
        historyIndex--;
        input.value = terminalHistory[historyIndex];
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex < terminalHistory.length - 1) {
        historyIndex++;
        input.value = terminalHistory[historyIndex];
      } else {
        historyIndex = terminalHistory.length;
        input.value = '';
      }
    }
  });
  
  // Click anywhere in terminal focuses input
  terminalEl.addEventListener('click', () => input.focus());
}

// ===== COMMAND EXECUTION =====
function executeCommand(cmdLine, output) {
  const session = SSHAuth.getSession();
  const username = session?.username || 'guest';
  
  // Echo command
  printLine(output, `\x1b[32m${username}@notebooks\x1b[0m:\x1b[34m~\x1b[0m$ ${cmdLine}`);
  
  const parts = cmdLine.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  
  if (TERMINAL_COMMANDS[cmd]) {
    try {
      TERMINAL_COMMANDS[cmd].handler(args, output);
    } catch (error) {
      printLine(output, `\x1b[31mError: ${error.message}\x1b[0m`);
    }
  } else {
    printLine(output, `\x1b[31mCommand not found: ${cmd}\x1b[0m`);
    printLine(output, 'Type \x1b[33mhelp\x1b[0m for available commands.');
  }
  
  printLine(output, '');
  
  // Scroll to bottom
  output.scrollTop = output.scrollHeight;
}

// ===== OUTPUT HELPERS =====
function printLine(output, text) {
  const line = document.createElement('div');
  line.innerHTML = parseAnsiColors(text);
  output.appendChild(line);
}

function parseAnsiColors(text) {
  const colorMap = {
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
  
  let result = text;
  result = result.replace(/\x1b\[([0-9;]+)m/g, (match, codes) => {
    const styles = codes.split(';').map(c => colorMap[c] || '').filter(Boolean);
    if (styles.length === 0 || codes === '0') {
      return '</span>';
    }
    return `<span style="${styles.join(';')}">`;
  });
  
  return result;
}

// ===== COMMAND HANDLERS =====
function cmdHelp(args, output) {
  if (args.length > 0) {
    const cmd = args[0].toLowerCase();
    if (TERMINAL_COMMANDS[cmd]) {
      printLine(output, `\x1b[1m${cmd}\x1b[0m - ${TERMINAL_COMMANDS[cmd].description}`);
      printLine(output, `Usage: ${TERMINAL_COMMANDS[cmd].usage}`);
    } else {
      printLine(output, `\x1b[31mUnknown command: ${cmd}\x1b[0m`);
    }
    return;
  }
  
  printLine(output, '\x1b[1mAvailable Commands:\x1b[0m');
  printLine(output, '');
  
  Object.entries(TERMINAL_COMMANDS).forEach(([name, info]) => {
    const padding = ' '.repeat(Math.max(0, 12 - name.length));
    printLine(output, `  \x1b[33m${name}\x1b[0m${padding}${info.description}`);
  });
}

function cmdUsers(args, output) {
  if (!SSHAuth.isAdmin()) {
    printLine(output, '\x1b[31mPermission denied. Admin access required.\x1b[0m');
    return;
  }
  
  const action = args[0]?.toLowerCase() || 'list';
  
  if (action === 'list') {
    const users = SSHAuth.getUsers();
    if (users.length === 0) {
      printLine(output, '\x1b[33mNo registered users.\x1b[0m');
      return;
    }
    
    printLine(output, '\x1b[1mRegistered Users:\x1b[0m');
    printLine(output, '─'.repeat(70));
    printLine(output, `  \x1b[1mID${' '.repeat(34)}USERNAME${' '.repeat(8)}FINGERPRINT\x1b[0m`);
    printLine(output, '─'.repeat(70));
    
    users.forEach(u => {
      const date = new Date(u.createdAt).toLocaleDateString();
      printLine(output, `  ${u.id.slice(0,8)}...  ${u.username.padEnd(14)} ${u.fingerprint?.slice(0,20) || 'N/A'}...`);
    });
    
  } else if (action === 'revoke') {
    const userId = args[1];
    if (!userId) {
      printLine(output, '\x1b[31mUsage: users revoke <user_id>\x1b[0m');
      return;
    }
    
    const users = SSHAuth.getUsers();
    const user = users.find(u => u.id.startsWith(userId));
    
    if (!user) {
      printLine(output, `\x1b[31mUser not found: ${userId}\x1b[0m`);
      return;
    }
    
    SSHAuth.revokeUser(user.id);
    SSHAuth.log('user_revoked', { userId: user.id, username: user.username });
    printLine(output, `\x1b[32mUser ${user.username} (${user.id.slice(0,8)}...) revoked successfully.\x1b[0m`);
    
  } else {
    printLine(output, '\x1b[31mUsage: users [list|revoke <id>]\x1b[0m');
  }
}

function cmdAdmins(args, output) {
  if (!SSHAuth.isAdmin()) {
    printLine(output, '\x1b[31mPermission denied. Admin access required.\x1b[0m');
    return;
  }
  
  const action = args[0]?.toLowerCase() || 'list';
  
  if (action === 'list') {
    const admins = SSHAuth.getAdmins();
    if (admins.length === 0) {
      printLine(output, '\x1b[33mNo admin accounts.\x1b[0m');
      return;
    }
    
    printLine(output, '\x1b[1mAdmin Accounts:\x1b[0m');
    printLine(output, '─'.repeat(70));
    
    admins.forEach(a => {
      const perms = a.permissions?.join(', ') || 'none';
      printLine(output, `  \x1b[32m${a.username}\x1b[0m (${a.id.slice(0,8)}...)`);
      printLine(output, `    Fingerprint: ${a.fingerprint || 'N/A'}`);
      printLine(output, `    Permissions: ${perms}`);
    });
    
  } else if (action === 'create') {
    const username = args[1];
    if (!username) {
      printLine(output, '\x1b[31mUsage: admins create <username>\x1b[0m');
      return;
    }
    
    printLine(output, `\x1b[33mGenerating key pair for admin: ${username}...\x1b[0m`);
    
    SSHAuth.registerAdmin(username).then(result => {
      printLine(output, '\x1b[32mAdmin account created successfully!\x1b[0m');
      printLine(output, '');
      printLine(output, '\x1b[1;31m*** SAVE THE PRIVATE KEY BELOW - THIS IS THE ONLY TIME IT WILL BE SHOWN ***\x1b[0m');
      printLine(output, '');
      printLine(output, `Fingerprint: \x1b[33m${result.fingerprint}\x1b[0m`);
      printLine(output, '');
      printLine(output, '\x1b[36m' + result.privateKey + '\x1b[0m');
      
      SSHAuth.log('admin_created', { username, fingerprint: result.fingerprint });
      
      output.scrollTop = output.scrollHeight;
    }).catch(err => {
      printLine(output, `\x1b[31mError: ${err.message}\x1b[0m`);
    });
    
  } else if (action === 'revoke') {
    const adminId = args[1];
    if (!adminId) {
      printLine(output, '\x1b[31mUsage: admins revoke <admin_id>\x1b[0m');
      return;
    }
    
    const admins = SSHAuth.getAdmins();
    const admin = admins.find(a => a.id.startsWith(adminId));
    
    if (!admin) {
      printLine(output, `\x1b[31mAdmin not found: ${adminId}\x1b[0m`);
      return;
    }
    
    const session = SSHAuth.getSession();
    if (admin.id === session?.id) {
      printLine(output, '\x1b[31mCannot revoke your own admin account.\x1b[0m');
      return;
    }
    
    SSHAuth.revokeAdmin(admin.id);
    SSHAuth.log('admin_revoked', { adminId: admin.id, username: admin.username });
    printLine(output, `\x1b[32mAdmin ${admin.username} revoked successfully.\x1b[0m`);
    
  } else if (action === 'rotate') {
    const adminId = args[1];
    if (!adminId) {
      printLine(output, '\x1b[31mUsage: admins rotate <admin_id>\x1b[0m');
      return;
    }
    
    const admins = SSHAuth.getAdmins();
    const admin = admins.find(a => a.id.startsWith(adminId));
    
    if (!admin) {
      printLine(output, `\x1b[31mAdmin not found: ${adminId}\x1b[0m`);
      return;
    }
    
    printLine(output, `\x1b[33mRotating key for admin: ${admin.username}...\x1b[0m`);
    
    SSHAuth.rotateKey(admin.id).then(result => {
      printLine(output, '\x1b[32mKey rotated successfully!\x1b[0m');
      printLine(output, '');
      printLine(output, '\x1b[1;31m*** SAVE THE NEW PRIVATE KEY BELOW ***\x1b[0m');
      printLine(output, '');
      printLine(output, `New Fingerprint: \x1b[33m${result.fingerprint}\x1b[0m`);
      printLine(output, '');
      printLine(output, '\x1b[36m' + result.privateKey + '\x1b[0m');
      
      SSHAuth.log('key_rotated', { username: admin.username, newFingerprint: result.fingerprint });
      
      output.scrollTop = output.scrollHeight;
    }).catch(err => {
      printLine(output, `\x1b[31mError: ${err.message}\x1b[0m`);
    });
    
  } else {
    printLine(output, '\x1b[31mUsage: admins [list|create <username>|revoke <id>|rotate <id>]\x1b[0m');
  }
}

function cmdLogs(args, output) {
  if (!SSHAuth.isAdmin()) {
    printLine(output, '\x1b[31mPermission denied. Admin access required.\x1b[0m');
    return;
  }
  
  const action = args[0]?.toLowerCase() || 'show';
  
  if (action === 'show') {
    const limit = parseInt(args[1]) || 20;
    const logs = SSHAuth.getLogs(limit);
    
    if (logs.length === 0) {
      printLine(output, '\x1b[33mNo log entries.\x1b[0m');
      return;
    }
    
    printLine(output, `\x1b[1mLast ${logs.length} Log Entries:\x1b[0m`);
    printLine(output, '─'.repeat(70));
    
    logs.forEach(log => {
      const time = new Date(log.timestamp).toLocaleString();
      const actionColor = log.action.includes('error') ? '31' : 
                          log.action.includes('login') ? '32' : 
                          log.action.includes('logout') ? '33' : '36';
      printLine(output, `\x1b[90m${time}\x1b[0m \x1b[${actionColor}m${log.action}\x1b[0m \x1b[37m${log.user}\x1b[0m`);
    });
    
  } else if (action === 'clear') {
    SSHAuth.clearLogs();
    SSHAuth.log('logs_cleared', {});
    printLine(output, '\x1b[32mLogs cleared.\x1b[0m');
    
  } else {
    printLine(output, '\x1b[31mUsage: logs [show [n]|clear]\x1b[0m');
  }
}

function cmdWhoami(args, output) {
  const session = SSHAuth.getSession();
  
  if (!session) {
    printLine(output, '\x1b[33mNot authenticated.\x1b[0m');
    return;
  }
  
  printLine(output, '\x1b[1mCurrent Session:\x1b[0m');
  printLine(output, `  Username:    \x1b[32m${session.username}\x1b[0m`);
  printLine(output, `  Role:        \x1b[33m${session.role}\x1b[0m`);
  printLine(output, `  Fingerprint: \x1b[36m${session.fingerprint || 'N/A'}\x1b[0m`);
  printLine(output, `  Permissions: \x1b[35m${session.permissions?.join(', ') || 'none'}\x1b[0m`);
  
  if (session.expiresAt) {
    const remaining = Math.max(0, session.expiresAt - Date.now());
    const hours = Math.floor(remaining / (60 * 60 * 1000));
    const mins = Math.floor((remaining % (60 * 60 * 1000)) / (60 * 1000));
    printLine(output, `  Expires in:  \x1b[90m${hours}h ${mins}m\x1b[0m`);
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
  
  const overlay = document.getElementById('terminalOverlay');
  if (!overlay) return;
  
  overlay.style.display = 'flex';
  requestAnimationFrame(() => {
    overlay.classList.add('active');
    initAdminTerminal();
  });
}

function hideAdminTerminal() {
  const overlay = document.getElementById('terminalOverlay');
  if (!overlay) return;
  
  overlay.classList.remove('active');
  setTimeout(() => {
    overlay.style.display = 'none';
  }, 380);
}

// Export
if (typeof window !== 'undefined') {
  window.showAdminTerminal = showAdminTerminal;
  window.hideAdminTerminal = hideAdminTerminal;
}
