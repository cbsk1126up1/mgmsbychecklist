# 오픈노트 · 매장 공사 체크리스트

HTML / CSS / JavaScript, Firebase Authentication 및 **Realtime Database**, Vercel 정적 배포를 사용합니다. Firestore는 사용하지 않습니다.

## 실행

Node.js 설치 후 `npm.cmd run dev`를 실행하고 http://localhost:5500 에 접속합니다. `npm.cmd run check`로 문법을 검사합니다. 추가 npm 의존성은 없습니다.

## 기능

항목 등록·수정·삭제, 분류 콤보상자(재료/주방설비/홀/외부/기타), 작업중(no)/작업완료(on) 라디오 버튼, 긴 메모, 검색 및 필터, 10건 단위 페이지 이동, 진행률, JSON 백업 및 가져오기를 지원합니다.

## Firebase 연결

1. `firebase-config.js`의 `export const firebaseConfig`를 유지하고 웹 앱 설정을 입력합니다. **databaseURL**에 Realtime Database 콘솔의 주소를 입력합니다. 현재 프로젝트의 주소는 설정 파일에 이미 있습니다.
2. Authentication에서 이메일/비밀번호 로그인을 활성화합니다. 로컬 및 배포 도메인을 승인 도메인에 등록합니다.
3. Realtime Database → 규칙에서 **기존 규칙을 먼저 백업**합니다.
4. `database.rules.json`의 `rules` 안에 있는 **gongsachecklist 블록만** 기존 규칙의 `rules` 객체 안에 추가하고 게시합니다. 기존 blogManagement, contacts, guestbooks, memos, testerGroup 등의 규칙은 유지합니다. 형제 블록 사이에는 쉼표가 필요합니다.
5. 페이지를 새로고침하고 로그인하여 항목을 추가합니다.

`database.rules.json`은 체크리스트 분기의 규칙 예시입니다. 다른 앱이 공유하는 데이터베이스이므로 이 파일 전체로 기존 규칙을 덮어쓰지 마세요. 자동 규칙 배포도 설정하지 않았습니다. 상위 경로에 이미 공개 `.read`/`.write` 허용 규칙이 있다면 자식 규칙으로 이를 취소할 수 없으므로 기존 앱의 권한 설계도 함께 검토해야 합니다.

## 저장 구조

```text
gongsachecklist
  사용자UID
    고유번호
      idx: 양의 안전 정수
      part: 분류 (필수, 최대 20자)
      content: 항목 (필수, 최대 60자)
      runcheck: no 또는 on (기본 no)
      bigo: 메모 (선택, 빈 문자열)
```

번호는 타임스탬프 기반으로 발급합니다. 계정별 경로에서 데이터를 읽고 저장하므로 ownerUid 필드를 별도로 저장하지 않습니다. 메모는 UTF-8 기준 최대 200KB입니다. 빈 경로는 첫 저장 후 생성됩니다. 이전 Firestore 데이터가 있다면 자동 이전하지 않으며 JSON 백업 후 가져오기를 사용합니다. `firestore.rules`는 이전 구현의 파일이며 현재 프로그램에는 사용하지 않습니다.

## 백업 및 저장

Firebase 설정이 없으면 브라우저 localStorage를 사용합니다. 브라우저 데이터를 지우기 전 JSON 백업을 보관하세요. 가져오기는 기존 항목을 유지하면서 새 고유번호로 추가합니다. 한 번에 최대 400개, 파일은 최대 10MB입니다.

Firebase 저장 완료 안내는 서버 응답을 받은 후 표시됩니다. 지연 시 입력 창에 대기 안내가 표시되며, 완료 전 창을 닫으면 저장이 유실될 수 있습니다. 실시간 목록에는 서버 확정 전 변경 내용이 잠시 보일 수도 있습니다. 여러 기기의 동시 수정은 마지막 저장이 적용됩니다.

## Vercel 배포

Git 저장소를 Vercel에 연결하고 Framework Preset **Other**, Build Command **node build.js**, Output Directory **dist** 로 배포합니다. `vercel.json`에도 이 설정이 포함되어 있습니다. 기존 프로젝트 설정의 서버 프레임워크나 라우팅 설정이 있다면 정적 사이트 설정으로 변경합니다. `npm.cmd run build`로 브라우저용 파일 5개만 dist에 복사합니다. server.js는 로컬 개발에만 사용합니다. 배포 주소를 Firebase Authentication 승인 도메인에 추가합니다. Firebase 설정 값은 브라우저용 공개 정보이며 서비스 계정 비밀키는 넣지 않습니다.

실제 서버 저장과 보안 규칙 검증은 사용자의 로그인 및 콘솔 규칙 게시 후 확인해야 합니다.

참고: https://firebase.google.com/docs/database/web/read-and-write
