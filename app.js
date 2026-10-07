import { firebaseConfig } from './firebase-config.js';
import { paginate } from './pagination.js';
import { checklistPath, validUid } from './workspace.js';

const $ = (selector) => document.querySelector(selector);
const LOCAL_KEY = 'opennote-gongsachecklist-v1';
const PARTS = ['재료', '주방설비', '홀', '외부', '기타'];
const configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
let items = [], statusFilter = 'all', editingId = null, user = null, api = null, unsubscribe = null;
let ready = !configured, toastTimer, lastIdx = 0;
let currentPage = 1;
let connectionIssue = '', connectionTimer;
let storeUid = null, sessionVersion = 0, sharingBusy = false;

function currentChecklistPath() {
  return checklistPath(storeUid);
}

function updateSharingInfo() {
  $('#my-uid').textContent = user?.uid || '로그인 필요';
  $('#current-store-id').textContent = storeUid || '연결 대기 중';
  $('#sharing-role').textContent = user && storeUid === user.uid ? '매장 소유자 · 다른 관리자를 추가할 수 있습니다.' : '공유 관리자 · 같은 매장 항목을 함께 수정합니다.';
  $('#member-controls').hidden = !user || storeUid !== user.uid;
}

function subscribeChecklist() {
  unsubscribe?.(); unsubscribe = null;
  clearTimeout(connectionTimer);
  const version = sessionVersion, path = currentChecklistPath();
  items = []; ready = false; connectionIssue = ''; currentPage = 1;
  $('#item-dialog').close();
  $('#storage-label').textContent = 'Firebase 동기화 중';
  $('#demo-notice').textContent = '공유 매장 체크리스트를 불러오는 중입니다.';
  updateSharingInfo(); render();
  connectionTimer = setTimeout(() => {
    if (ready || version !== sessionVersion) return;
    connectionIssue = '데이터 응답이 지연되고 있습니다. 네트워크와 Realtime Database 공유 매장 규칙을 확인해 주세요.';
    $('#storage-label').textContent = '데이터 응답 대기 중';
    $('#demo-notice').textContent = connectionIssue;
  }, 12000);
  unsubscribe = api.onValue(api.ref(api.db, path), snapshot => {
    if (version !== sessionVersion || path !== currentChecklistPath()) return;
    try {
      const loaded = [];
      snapshot.forEach(child => { loaded.push({ ...validate(child.val()), id: child.key }); });
      items = loaded; ready = true;
      clearTimeout(connectionTimer); connectionIssue = '';
      $('#storage-label').textContent = 'Firebase 연결됨';
      $('#demo-notice').textContent = `프로젝트: ${firebaseConfig.projectId} · 계정: ${user.email} · 매장 ID: ${storeUid} · ${loaded.length}개 항목 · 공유 매장에 실시간 저장됩니다.`;
      render();
    } catch (error) { connectionFailed(error); }
  }, error => {
    if (version !== sessionVersion || path !== currentChecklistPath()) return;
    items = []; render(); connectionFailed(error);
  });
}

function connectionFailed(error) {
  clearTimeout(connectionTimer);
  ready = false;
  connectionIssue = `Realtime Database 연결 오류 (${error.code || 'unknown'}): ${message(error)}`;
  $('#storage-label').textContent = '데이터베이스 연결 확인 필요';
  $('#demo-notice').textContent = connectionIssue;
  console.error('Realtime Database checklist connection failed:', error);
  toast(connectionIssue);
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function message(error) {
  const errors = {
    'auth/invalid-credential': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/wrong-password': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/user-not-found': '이메일 또는 비밀번호를 확인해 주세요.',
    'auth/email-already-in-use': '이미 가입된 이메일입니다. 로그인해 주세요.',
    'auth/weak-password': '비밀번호는 6자 이상 입력해 주세요.',
    'auth/too-many-requests': '요청이 많습니다. 잠시 후 다시 시도해 주세요.',
    'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
    'auth/operation-not-allowed': 'Firebase에서 이메일/비밀번호 로그인을 활성화해 주세요.',
    'auth/unauthorized-domain': 'Firebase Authentication의 승인된 도메인에 현재 주소를 추가해 주세요.',
    'permission-denied': '접근 권한이 없습니다. Realtime Database의 체크리스트 보안 규칙을 확인해 주세요.',
    'PERMISSION_DENIED': '접근 권한이 없습니다. Realtime Database의 체크리스트 보안 규칙을 확인해 주세요.',
    'unavailable': '서버에 연결할 수 없습니다. 네트워크 연결을 확인해 주세요.'
  };
  return errors[error.code] || error.message || '저장하지 못했습니다. 다시 시도해 주세요.';
}

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('항목 형식이 올바르지 않습니다.');
  const { idx, part, content, runcheck, bigo } = value;
  if (!Number.isSafeInteger(idx) || idx < 1) throw new Error('고유번호는 양의 정수여야 합니다.');
  if (typeof part !== 'string' || !part.trim() || part.length > 20) throw new Error('분류는 1~20자로 입력해 주세요.');
  if (typeof content !== 'string' || !content.trim() || content.length > 60) throw new Error('항목은 1~60자로 입력해 주세요.');
  if (!['no', 'on'].includes(runcheck)) throw new Error('실행여부는 no 또는 on이어야 합니다.');
  if (bigo != null && typeof bigo !== 'string') throw new Error('비고는 문자열이어야 합니다.');
  // 긴 메모 입력을 지원하되 과도한 데이터 크기를 제한합니다.
  if (new TextEncoder().encode(bigo || '').length > 200000) throw new Error('메모는 UTF-8 기준 200KB 이하로 입력해 주세요.');
  return { idx, part: part.trim(), content: content.trim(), runcheck, bigo: bigo || '' };
}

function nextIdx() {
  lastIdx = Math.max(Date.now() * 1000 + Math.floor(Math.random() * 1000), lastIdx + 1, ...items.map(x => x.idx + 1));
  return lastIdx;
}

function loadLocal() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
    if (!Array.isArray(saved)) throw new Error('잘못된 저장 형식');
    items = saved.map(validate).map(x => ({ ...x, id: String(x.idx) }));
  } catch {
    items = [];
    ready = false;
    toast('기존 브라우저 데이터를 읽지 못했습니다. 원본 보존을 위해 저장을 중지했습니다.');
  }
  render();
}

function requireAccess() {
  if (configured && !user) { $('#auth-dialog').showModal(); return false; }
  if (!ready) { toast(connectionIssue || (configured ? '로그인은 완료됐지만 데이터를 불러오는 중입니다. 아래 연결 안내를 확인해 주세요.' : '데이터 연결을 확인한 후 다시 시도해 주세요.')); return false; }
  return true;
}

async function saveItem(value, id = null) {
  const data = validate(value);
  if (configured) {
    await api.set(api.ref(api.db, `${currentChecklistPath()}/${id || data.idx}`), data);
  } else {
    const next = id ? items.map(x => x.id === id ? { ...data, id } : x) : [...items, { ...data, id: String(data.idx) }];
    localStorage.setItem(LOCAL_KEY, JSON.stringify(next.map(({ id: ignored, ...x }) => x)));
    items = next;
    render();
  }
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function render() {
  const completed = items.filter(x => x.runcheck === 'on').length;
  const percentage = items.length ? Math.round(completed / items.length * 100) : 0;
  $('#total-count').textContent = items.length;
  $('#pending-count').textContent = items.length - completed;
  $('#done-count').textContent = completed;
  $('#progress-number').textContent = percentage;
  $('#progress-bar').value = percentage;
  $('#progress-caption').textContent = items.length ? (percentage === 100 ? '모든 작업을 마쳤어요!' : `${items.length}개 중 ${completed}개 작업을 마쳤어요`) : '첫 번째 작업을 등록해 보세요';
  $('#list-count').textContent = items.length;
  const selectedPart = $('#part-filter').value;
  const parts = [...new Set([...PARTS, ...items.map(x => x.part)])];
  $('#part-filter').replaceChildren(new Option('모든 분류', ''), ...parts.map(x => new Option(x, x)));
  $('#part-filter').value = parts.includes(selectedPart) ? selectedPart : '';
  const search = $('#search-input').value.trim().toLocaleLowerCase();
  const filtered = [...items].sort((a, b) => a.idx - b.idx).filter(x =>
    (statusFilter === 'all' || x.runcheck === statusFilter) &&
    (!$('#part-filter').value || x.part === $('#part-filter').value) &&
    (!search || `${x.part} ${x.content} ${x.bigo}`.toLocaleLowerCase().includes(search)));
  const body = $('#checklist-body');
  const page = paginate(filtered, currentPage);
  currentPage = page.currentPage;
  body.replaceChildren();
  for (const [index, item] of page.rows.entries()) {
    const row = element('tr', item.runcheck === 'on' ? 'done' : '');
    row.append(element('td', 'number', String(page.offset + index + 1).padStart(2, '0')));
    const part = element('td'); part.append(element('span', 'part-tag', item.part)); row.append(part);
    row.append(element('td', 'item-content', item.content));
    const status = element('td'), radios = element('div', 'status-radios');
    radios.setAttribute('role', 'group'); radios.setAttribute('aria-label', `${item.content} 진행 상태`);
    for (const [value, label] of [['no', '작업중'], ['on', '작업완료']]) {
      const choice = element('label', `status-choice ${value === 'on' ? 'complete' : ''}`);
      const input = element('input'); input.type = 'radio'; input.name = `status-${item.id}`; input.value = value; input.checked = item.runcheck === value;
      input.addEventListener('change', async () => {
        if (!requireAccess()) { render(); return; }
        radios.querySelectorAll('input').forEach(x => { x.disabled = true; });
        try { await saveItem({ ...item, runcheck: value }, item.id); toast('진행 상태를 저장했습니다.'); }
        catch (error) { toast(message(error)); render(); }
      });
      choice.append(input, document.createTextNode(label)); radios.append(choice);
    }
    status.append(radios); row.append(status);
    const memo = element('td'); const preview = element('div', 'memo-text', item.bigo || '—'); memo.append(preview); row.append(memo);
    const actions = element('td'), buttons = element('div', 'row-actions');
    const edit = element('button', 'icon-button', '✎'); edit.type = 'button'; edit.setAttribute('aria-label', `${item.content} 수정 및 메모 보기`); edit.title = '수정 / 전체 메모 보기'; edit.addEventListener('click', () => openItem(item));
    const remove = element('button', 'icon-button delete', '×'); remove.type = 'button'; remove.setAttribute('aria-label', `${item.content} 삭제`); remove.title = '삭제'; remove.addEventListener('click', () => removeItem(item, remove));
    buttons.append(edit, remove); actions.append(buttons); row.append(actions); body.append(row);
  }
  $('#empty-state').hidden = filtered.length > 0;
  $('#empty-state h3').textContent = items.length ? '조건에 맞는 항목이 없어요' : '아직 등록된 항목이 없어요';
  $('#empty-state p').textContent = items.length ? '검색어나 필터를 변경해 보세요.' : '첫 공사 항목을 추가하고 오픈 준비를 시작해 보세요.';
  $('#empty-add-button').hidden = items.length > 0;
  $('#result-caption').textContent = filtered.length
    ? `총 ${items.length}개 항목 · 검색 결과 ${filtered.length}개 중 ${page.offset + 1}–${page.offset + page.rows.length}개 표시`
    : `총 ${items.length}개 항목 · 0개 표시`;
  renderPagination(page);
}

function renderPagination({ totalPages }) {
  const navigation = $('#pagination');
  navigation.replaceChildren();
  navigation.hidden = totalPages <= 1;
  if (navigation.hidden) return;
  const addButton = (label, target, disabled = false, active = false) => {
    const button = element('button', `page-button${active ? ' active' : ''}`, label);
    button.type = 'button';
    button.disabled = disabled;
    if (active) button.setAttribute('aria-current', 'page');
    if (/^\d+$/.test(label)) button.setAttribute('aria-label', `${label}페이지`);
    button.addEventListener('click', () => { currentPage = target; render(); });
    navigation.append(button);
  };
  addButton('이전', currentPage - 1, currentPage === 1);
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  if (start > 1) {
    addButton('1', 1);
    if (start > 2) navigation.append(element('span', 'page-gap', '…'));
  }
  for (let number = start; number <= end; number++) addButton(String(number), number, false, number === currentPage);
  if (end < totalPages) {
    if (end < totalPages - 1) navigation.append(element('span', 'page-gap', '…'));
    addButton(String(totalPages), totalPages);
  }
  addButton('다음', currentPage + 1, currentPage === totalPages);
}

function openItem(item = null) {
  if (!requireAccess()) return;
  editingId = item?.id || null;
  $('#item-form').reset();
  $('#item-error').textContent = '';
  $('#dialog-title').textContent = item ? '공사 항목 수정' : '공사 항목 추가';
  if (item) {
    $('#part-input').value = PARTS.includes(item.part) ? item.part : '';
    $('#content-input').value = item.content;
    $('#bigo-input').value = item.bigo;
    $(`#item-form input[value="${item.runcheck}"]`).checked = true;
  }
  $('#item-dialog').showModal();
}

async function removeItem(item, button) {
  if (!requireAccess() || !confirm(`「${item.content}」 항목을 삭제할까요?\n삭제한 항목은 복구할 수 없습니다.`)) return;
  button.disabled = true;
  try {
    if (configured) await api.remove(api.ref(api.db, `${currentChecklistPath()}/${item.id}`));
    else {
      const next = items.filter(x => x.id !== item.id);
      localStorage.setItem(LOCAL_KEY, JSON.stringify(next.map(({ id: ignored, ...x }) => x)));
      items = next; render();
    }
    toast('항목을 삭제했습니다.');
  } catch (error) { toast(message(error)); button.disabled = false; }
}

$('#add-button').addEventListener('click', () => openItem());
$('#empty-add-button').addEventListener('click', () => openItem());
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => {
  if (!$('#save-button').disabled) document.getElementById(button.dataset.close).close();
}));
$('#item-dialog').addEventListener('cancel', event => { if ($('#save-button').disabled) event.preventDefault(); });
$('#item-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!requireAccess()) return;
  const existing = items.find(x => x.id === editingId);
  if (editingId && !existing) { $('#item-error').textContent = '이미 삭제된 항목입니다. 창을 닫고 다시 확인해 주세요.'; return; }
  $('#save-button').disabled = true;
  $('#save-button').textContent = '저장 중…';
  $('#item-error').textContent = '';
  const saveTimer = setTimeout(() => {
    $('#item-error').textContent = '서버의 저장 확인을 기다리고 있습니다. 입력 내용은 유지됩니다. 네트워크 연결을 확인하고 완료 안내가 나올 때까지 창을 닫지 마세요.';
  }, 12000);
  try {
    await saveItem({ idx: existing?.idx || nextIdx(), part: $('#part-input').value, content: $('#content-input').value, runcheck: $('#item-form input[name="runcheck"]:checked').value, bigo: $('#bigo-input').value }, editingId);
    $('#item-dialog').close(); toast('항목을 저장했습니다.');
  } catch (error) { $('#item-error').textContent = message(error); }
  finally { clearTimeout(saveTimer); $('#save-button').disabled = false; $('#save-button').textContent = '저장하기'; }
});
document.querySelectorAll('[data-status]').forEach(button => button.addEventListener('click', () => {
  statusFilter = button.dataset.status;
  currentPage = 1;
  document.querySelectorAll('[data-status]').forEach(x => { x.classList.toggle('active', x === button); x.setAttribute('aria-pressed', String(x === button)); });
  render();
}));
$('#part-filter').addEventListener('change', () => { currentPage = 1; render(); });
$('#search-input').addEventListener('input', () => { currentPage = 1; render(); });

$('#export-button').addEventListener('click', () => {
  const backup = { version: 1, exportedAt: new Date().toISOString(), gongsachecklist: items.map(({ id, ...x }) => validate(x)) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = element('a'); link.href = url; link.download = `공사체크리스트-${new Date().toISOString().slice(0, 10)}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('백업 파일을 다운로드했습니다.');
});
$('#import-button').addEventListener('click', () => { if (requireAccess()) $('#import-file').click(); });
$('#import-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  const button = $('#import-button');
  try {
    if (!requireAccess()) return;
    if (file.size > 10000000) throw new Error('백업 파일은 10MB 이하로 선택해 주세요.');
    const parsed = JSON.parse(await file.text());
    const source = Array.isArray(parsed) ? parsed : parsed.gongsachecklist;
    if (!Array.isArray(source) || !source.length) throw new Error('가져올 항목이 없는 백업 파일입니다.');
    if (source.length > 400) throw new Error('한 번에 최대 400개 항목을 가져올 수 있습니다.');
    const imported = source.map(validate);
    if (!confirm(`${imported.length}개 항목을 추가할까요? 기존 항목은 유지되며 새 고유번호가 부여됩니다.`)) return;
    button.disabled = true;
    const next = imported.map(x => ({ ...x, idx: nextIdx() }));
    if (configured) {
      const updates = Object.fromEntries(next.map(x => [String(x.idx), x]));
      await api.update(api.ref(api.db, currentChecklistPath()), updates);
    } else {
      const merged = [...items, ...next.map(x => ({ ...x, id: String(x.idx) }))];
      localStorage.setItem(LOCAL_KEY, JSON.stringify(merged.map(({ id, ...x }) => x)));
      items = merged; render();
    }
    toast(`${next.length}개 항목을 가져왔습니다.`);
  } catch (error) { toast(message(error)); }
  finally { event.target.value = ''; button.disabled = false; }
});

$('#account-button').addEventListener('click', async () => {
  if (!configured) { toast('firebase-config.js에 Firebase 설정을 입력하면 로그인할 수 있습니다.'); return; }
  if (!api) { toast('Firebase 연결을 확인해 주세요.'); return; }
  if (user) {
    try { await api.signOut(api.auth); toast('로그아웃했습니다.'); } catch (error) { toast(message(error)); }
  } else { $('#auth-error').textContent = ''; $('#auth-dialog').showModal(); }
});
async function authenticate(signup = false) {
  if (!$('#auth-form').reportValidity() || !api) return;
  const buttons = $('#auth-form').querySelectorAll('button');
  buttons.forEach(x => { x.disabled = true; });
  $('#auth-error').textContent = '';
  try {
    await (signup ? api.createUserWithEmailAndPassword : api.signInWithEmailAndPassword)(api.auth, $('#email-input').value.trim(), $('#password-input').value);
    $('#auth-dialog').close(); $('#auth-form').reset(); toast(signup ? '가입이 완료되었습니다.' : '로그인했습니다.');
  } catch (error) { $('#auth-error').textContent = message(error); }
  finally { buttons.forEach(x => { x.disabled = false; }); }
}
$('#auth-form').addEventListener('submit', event => { event.preventDefault(); authenticate(); });
$('#signup-button').addEventListener('click', () => authenticate(true));

$('#sharing-button').addEventListener('click', () => {
  if ($('#save-button').disabled) { toast('항목 저장이 완료된 후 매장을 변경해 주세요.'); return; }
  if (!configured) { toast('공유 기능은 Firebase 연결 후 사용할 수 있습니다.'); return; }
  if (!user) { $('#auth-dialog').showModal(); return; }
  updateSharingInfo(); $('#sharing-error').textContent = '';
  $('#sharing-dialog').showModal();
});

async function sharingAction(action) {
  if (sharingBusy || !user || !api) return;
  sharingBusy = true;
  const buttons = $('#sharing-dialog').querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  $('#sharing-error').textContent = '';
  try { await action(); }
  catch (error) { $('#sharing-error').textContent = message(error); }
  finally { sharingBusy = false; buttons.forEach(button => { button.disabled = false; }); }
}

$('#add-member-button').addEventListener('click', () => sharingAction(async () => {
  if (storeUid !== user.uid) throw new Error('매장 소유자만 관리자를 등록할 수 있습니다.');
  const memberUid = $('#member-uid-input').value.trim();
  if (!validUid(memberUid)) throw new Error('추가할 관리자의 사용자 UID를 확인해 주세요.');
  if (memberUid === user.uid) throw new Error('본인은 이미 매장 소유자입니다.');
  await api.set(api.ref(api.db, `gongsachecklistMembers/${storeUid}/${memberUid}`), true);
  $('#member-uid-input').value = '';
  toast('관리자를 등록했습니다. 상대방에게 매장 ID를 전달해 주세요.');
}));

async function selectStore(targetUid) {
  if (!validUid(targetUid)) throw new Error('매장 ID를 확인해 주세요.');
  const current = user, version = sessionVersion;
  if (targetUid !== current.uid) {
    const membership = await api.get(api.ref(api.db, `gongsachecklistMembers/${targetUid}/${current.uid}`));
    if (membership.val() !== true) throw new Error('이 매장의 관리자로 등록되지 않았습니다. 매장 소유자에게 내 UID를 전달해 주세요.');
  }
  if (version !== sessionVersion) return;
  await api.set(api.ref(api.db, `gongsachecklistProfiles/${current.uid}/storeUid`), targetUid);
  if (version !== sessionVersion) return;
  storeUid = targetUid;
  subscribeChecklist();
  $('#sharing-dialog').close();
  toast('매장 연결을 변경했습니다.');
}
$('#join-store-button').addEventListener('click', () => sharingAction(() => selectStore($('#store-id-input').value.trim())));
$('#own-store-button').addEventListener('click', () => sharingAction(() => selectStore(user.uid)));
$('#sharing-dialog').addEventListener('cancel', event => { if (sharingBusy) event.preventDefault(); });

async function initialize() {
  if (!configured) { loadLocal(); return; }
  $('#storage-label').textContent = 'Firebase 연결 중';
  $('#demo-notice').textContent = '로그인하면 내 계정의 공사 체크리스트를 불러옵니다.';
  render();
  try {
    if (!firebaseConfig.databaseURL) throw new Error('firebase-config.js에 Realtime Database의 databaseURL을 입력해 주세요.');
    const base = 'https://www.gstatic.com/firebasejs/12.4.0';
    const [appModule, authModule, dbModule] = await Promise.all([
      import(`${base}/firebase-app.js`), import(`${base}/firebase-auth.js`), import(`${base}/firebase-database.js`)
    ]);
    const app = appModule.initializeApp(firebaseConfig);
    api = { ...authModule, ...dbModule, auth: authModule.getAuth(app), db: dbModule.getDatabase(app) };
    api.onAuthStateChanged(api.auth, async current => {
      const version = ++sessionVersion;
      unsubscribe?.(); unsubscribe = null;
      clearTimeout(connectionTimer); connectionIssue = '';
      user = current; storeUid = null; items = []; ready = !current; currentPage = 1;
      $('#item-dialog').close();
      $('#sharing-dialog').close();
      $('#account-button').textContent = current ? '로그아웃' : '로그인';
      $('#account-button').title = current ? `${current.email} · UID: ${current.uid}` : '로그인';
      $('#storage-label').textContent = current ? 'Firebase 동기화 중' : '로그인 필요';
      $('#demo-notice').textContent = current ? `${current.email} 계정으로 관리 중 · 브라우저에서 작성한 항목은 백업 파일로 가져올 수 있습니다.` : '로그인하면 내 계정의 공사 체크리스트를 불러옵니다.';
      render();
      if (current) {
        connectionTimer = setTimeout(() => {
          if (version !== sessionVersion || ready) return;
          $('#demo-notice').textContent = '매장 설정을 불러오는 중입니다. 네트워크와 공유 매장 보안 규칙을 확인해 주세요.';
        }, 12000);
        try {
          const profile = await api.get(api.ref(api.db, `gongsachecklistProfiles/${current.uid}/storeUid`));
          if (version !== sessionVersion) return;
          storeUid = profile.val() || current.uid;
          subscribeChecklist();
        } catch (error) { if (version === sessionVersion) connectionFailed(error); }
      }
    });
  } catch (error) {
    ready = false;
    $('#storage-label').textContent = 'Firebase 연결 실패';
    $('#demo-notice').textContent = 'Firebase 연결에 실패했습니다. 설정과 네트워크를 확인한 뒤 새로고침해 주세요.';
    toast(message(error));
  }
}
window.addEventListener('storage', event => { if (!configured && event.key === LOCAL_KEY) { ready = true; loadLocal(); } });
initialize();
