# 연주 웹앱

MIDI/NWC 악보 파일을 업로드하면 계이름·장조·박자를 자동 분석해 저장하고,
화면 중앙의 원형 버튼 하나로 연주하는 웹앱.

- 터치 = 저장된 멜로디를 순서대로 한 음씩 재생
- 누른 채 위/아래로 드래그 = 음 높낮이 변화 (원래 음에서 최대 온음 정도까지만)
- 누른 채 좌우로 흔들기 = 비브라토

## 기술 스택

- React + Vite + TypeScript (프론트엔드)
- Tone.js (Web Audio 합성 악기 — 샘플 파일 없이 동작)
- Cloudflare Pages Functions + D1 (곡 분석 데이터 저장 API)

## 지원 파일 형식

- `.mid` / `.midi` — 완전 지원 (`@tonejs/midi`로 파싱)
- `.nwctxt` — Noteworthy Composer의 텍스트 클립 포맷. 지원하지만 다음은 근사치입니다:
  - 첫 번째 보표(Staff)만 읽음 (단선율 기준)
  - 마디 전체에 적용되는 임시표 지속은 처리하지 않고, 음표 하나에만 적용
  - 잇단음표(triplet 등)는 길이 보정 없이 표기값 그대로 재생
- `.nwc` (바이너리) — **지원 안 함**. Noteworthy Composer 비공개 포맷이라 파싱 불가.
  Noteworthy Composer에서 "텍스트로 저장(.nwctxt)" 후 업로드하세요.

## 로컬 개발

```bash
npm install
npm run dev
```

프론트엔드만 뜨며, `/api/songs` 같은 API는 동작하지 않습니다 (더미 상태).

### API + D1까지 포함해서 로컬 테스트

```bash
npm run d1:init:local   # 로컬 D1에 스키마 적용 (최초 1회)
npm run pages:dev        # 빌드 후 wrangler pages dev로 API까지 포함해서 실행
```

## Cloudflare Pages 배포

1. **Cloudflare 로그인 및 D1 데이터베이스 생성** (최초 1회)

   ```bash
   npx wrangler login
   npx wrangler d1 create music-player-db
   ```

   출력된 `database_id`를 [wrangler.toml](wrangler.toml)의
   `REPLACE_WITH_D1_DATABASE_ID` 자리에 넣으세요.

2. **원격 D1에 스키마 적용**

   ```bash
   npm run d1:init:remote
   ```

3. **Pages 프로젝트 생성 및 배포**

   ```bash
   npx wrangler pages project create music-player-app
   npm run pages:deploy
   ```

   이후 Cloudflare 대시보드 → Pages → 프로젝트 → Settings → Functions →
   D1 database bindings 에서 `DB` 바인딩이 방금 만든 D1 DB를 가리키는지 확인하세요
   (wrangler.toml 설정이 자동 반영되지 않는 경우가 있어 대시보드에서 한 번 더 확인 권장).

4. **Git 연동으로 자동 배포하려면** GitHub 저장소를 Cloudflare Pages 프로젝트에
   연결하고, 빌드 명령어는 `npm run build`, 빌드 출력 디렉터리는 `dist`로 설정하세요.
   D1 바인딩은 대시보드에서 별도로 추가해야 합니다 (wrangler.toml은 로컬/CI 배포에만 사용).

## 프로젝트 구조

```
src/
  types/music.ts       공통 곡/음표 타입
  lib/
    midiParser.ts       MIDI 파싱
    nwcParser.ts         NWC(.nwctxt) 파싱
    keyDetection.ts      Krumhansl-Schmuckler 조성 추정
    solfege.ts            movable-do 계이름 매핑
    analyze.ts             파싱 결과 → 분석 결과 통합
    api.ts                   /api/songs 클라이언트
  audio/
    instruments.ts       Tone.js 악기 프리셋 7종
    player.ts               연주 엔진 (재생/피치벤드/비브라토)
  components/
    CircularPlayButton.tsx 원형 터치 연주 버튼 (제스처 처리)
    InstrumentSelector.tsx
    SongLibrary.tsx
    FileUpload.tsx
  store/useAppStore.ts   전역 상태 (zustand)
functions/api/            Cloudflare Pages Functions (곡 저장/조회 API)
schema.sql                 D1 스키마
```

## 알려진 한계 / 다음 단계 후보

- 악기 음색은 모두 Tone.js 신디사이저 합성이며, 실제 악기 샘플이 아닙니다.
- 화음(동시에 여러 음)이 있는 곡은 터치 한 번에 여러 음이 같이 울리지만,
  피치벤드/비브라토는 현재 눌려있는 모든 음에 동일하게 적용됩니다.
- NWC 텍스트 포맷의 임시표 지속, 잇단음표, 멀티 스태프는 근사 처리됩니다.
