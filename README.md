# 연주 웹앱

MIDI/NWC 악보 파일을 업로드하면 계이름·장조·박자를 자동 분석해 저장하고,
화면 중앙의 원형 버튼 하나로 연주하는 웹앱.

- 터치 = 저장된 멜로디를 순서대로 한 음씩 재생
- 누른 채 위/아래로 드래그 = 음 높낮이 변화 (원래 음에서 최대 온음 정도까지만)
- 누른 채 좌우로 흔들기 = 비브라토

## 기술 스택

- React + Vite + TypeScript (프론트엔드)
- Tone.js (Web Audio 합성 악기 — 샘플 파일 없이 동작)
- Express + Node 내장 `node:sqlite` (곡 분석 데이터 저장 API, 상시구동 서버)
- Cloudflare Tunnel(cloudflared)로 `music.jungsim.org`에 노출, NSSM으로 Windows 서비스 등록

개인용 앱으로 Cloudflare Pages 대신 이 PC에서 직접 상시 구동하는 방식을 씁니다
(자매 앱인 pastor-os/emotion/jarvis와 동일한 패턴).

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

프론트엔드만 뜨며, `/api/songs` 같은 API는 동작하지 않습니다.

### 상시구동 서버까지 포함해서 로컬 테스트

```bash
npm run build   # dist/ 생성
npm start        # Express 서버 (http://localhost:8791) — 정적 파일 + /api/songs 모두 서빙
```

DB 파일은 `data/music.db`에 자동 생성됩니다 (최초 요청 시 schema.sql 자동 적용).

## 배포 (Windows + Cloudflare Tunnel)

1. **빌드**

   ```bash
   npm run build
   ```

2. **NSSM으로 Windows 서비스 등록** (관리자 권한 PowerShell/CMD 필요)

   ```powershell
   nssm install MusicPlayerApp "C:\Program Files\nodejs\node.exe" "D:\안티그래비티\클로드 스킬\music-player-app\server\index.mjs"
   nssm set MusicPlayerApp AppDirectory "D:\안티그래비티\클로드 스킬\music-player-app"
   nssm set MusicPlayerApp AppStdout "D:\안티그래비티\클로드 스킬\music-player-app\logs\out.log"
   nssm set MusicPlayerApp AppStderr "D:\안티그래비티\클로드 스킬\music-player-app\logs\err.log"
   nssm set MusicPlayerApp Start SERVICE_AUTO_START
   nssm start MusicPlayerApp
   ```

3. **Cloudflare Tunnel** — 기존 `jarvis-hermes` 터널(`emotion`, `jarvis` 앱과 공유)의
   `config.yml`에 이미 아래 항목이 추가되어 있고, DNS route(`music.jungsim.org` CNAME)도
   생성되어 있습니다:

   ```yaml
   - hostname: music.jungsim.org
     service: http://localhost:8791
   ```

   `cloudflared` 서비스가 꺼져 있으면 (관리자 권한 필요):

   ```powershell
   Start-Service -Name Cloudflared
   # 이미 떠 있는데 설정만 바뀐 경우
   Restart-Service -Name Cloudflared
   ```

4. **접근 보호 (Zero Trust Access)** — Cloudflare Zero Trust 대시보드 →
   Access → Applications 에서 `music.jungsim.org`를 등록하고 본인 이메일만
   허용하는 정책을 추가하세요 (다른 자매 앱들과 동일한 방식). 대시보드 로그인이
   필요한 단계라 CLI로 자동화하지 않았습니다.

### 코드 수정 후 반영

```bash
npm run build
nssm restart MusicPlayerApp
```

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
server/
  index.mjs               Express 서버 진입점 (정적 파일 + API)
  db.mjs                    node:sqlite 기반 곡 저장소
schema.sql                 SQLite 스키마 (서버 시작 시 자동 적용)
data/music.db               로컬 SQLite DB 파일 (git 추적 안 함)
```

## 알려진 한계 / 다음 단계 후보

- 악기 음색은 모두 Tone.js 신디사이저 합성이며, 실제 악기 샘플이 아닙니다.
- 화음(동시에 여러 음)이 있는 곡은 터치 한 번에 여러 음이 같이 울리지만,
  피치벤드/비브라토는 현재 눌려있는 모든 음에 동일하게 적용됩니다.
- NWC 텍스트 포맷의 임시표 지속, 잇단음표, 멀티 스태프는 근사 처리됩니다.
- DB는 이 PC 로컬 SQLite 파일 하나뿐이라 백업/다중 기기 동기화는 별도 처리가 필요합니다.
