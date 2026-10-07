export function validUid(uid) {
  return typeof uid === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(uid);
}

export function checklistPath(storeUid) {
  if (!validUid(storeUid)) throw new Error('올바른 매장 ID를 입력해 주세요.');
  return `gongsachecklist/${storeUid}`;
}
