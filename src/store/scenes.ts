// 多場景（2.0 α3，F8）：一個專案最多 12 場、總長 180 秒（決定表第 14 項）。
// store 的 v／m／subject／tune／aspect／audio 是「目前場景」的即時內容；換場景時先把它們收回場景清單（stash），再把目標場景放出來。
// 加、刪、換、改名都是一般的 store 變動，所以都進復原歷史（history.ts 的文件包含 scenes、activeScene、chat）。
import { MOTION_MAP } from '../data/motion';
import { loopSeconds } from '../engine/renderer';
import { resolveMove } from '../engine/resolve';
import { SUBJECTS } from '../engine/subjects';
import { themes } from '../engine/themes';
import { sanitizeAudioPrefs } from '../audio/plan';
import { clock } from '../engine/clock';
import { MAX_CHAT, MAX_SCENES, newId, sceneKindOf, sceneMusicOf, type Scene } from './project';
import { useStore } from './store';

export const MAX_TOTAL_SECONDS = 180;

type St = ReturnType<typeof useStore.getState>;

/** 目前場景的即時內容寫回場景清單 */
export function stashActive(s: St = useStore.getState()): Scene[] {
  const mix = { v: s.v, m: s.m, subject: s.subject, tune: s.tune, music: sceneMusicOf(s.audio), aspect: s.aspect, ...(Object.keys(s.content).length ? { content: s.content } : {}) };
  const theme = s.subject === 'custom' ? themes.currentJson() : null;
  return s.scenes.map((sc) => {
    if (sc.id !== s.activeScene) return sc;
    const { theme: _t, chat: _c, ...rest } = sc;
    return { ...rest, mix, kind: sceneKindOf(mix.subject), ...(theme ? { theme } : {}), ...(s.chat.length ? { chat: s.chat.slice(-MAX_CHAT) } : {}) };
  });
}

/** 把一個場景放到 store 的即時欄位（不含 scenes 清單本身） */
function patchFor(sc: Scene, s: St) {
  let subject = sc.mix.subject;
  if (sc.theme) {
    try {
      if (sc.theme !== themes.currentJson()) themes.add(sc.theme);
    } catch {
      subject = 'mascot';
    }
  } else if (subject === 'custom' && !themes.has()) subject = 'mascot';
  return {
    activeScene: sc.id,
    v: sc.mix.v,
    m: sc.mix.m,
    subject,
    tune: sc.mix.tune,
    aspect: sc.mix.aspect,
    audio: sanitizeAudioPrefs({ ...s.audio, ...sc.mix.music }),
    chat: sc.chat ?? [],
    stamps: [],
    content: sc.mix.content ?? {},
  };
}

/** 一個場景的長度（秒）：設了長度（2.0 β）就用它；否則是一個動畫循環（目前場景用即時內容，其他的用存著的）。
 *  整支片子裡實際放多久還要吸到小節線，看 film.ts 的 filmModel */
export function sceneSeconds(sc: Scene, s: St = useStore.getState()): number {
  if (sc.dur) return sc.dur;
  return loopOf(sc, s);
}

/** 一個場景的一個動畫循環（秒） */
export function loopOf(sc: Scene, s: St = useStore.getState()): number {
  const live = sc.id === s.activeScene;
  const subject = live ? s.subject : sc.mix.subject;
  const tune = live ? s.tune : sc.mix.tune;
  const m = live ? s.m : sc.mix.m;
  const move = resolveMove(m, MOTION_MAP, tune);
  if (subject === 'custom' && !live) {
    // 不是目前場景的生成內容：主題不在播放中，直接讀它的 loop
    try {
      const loop = Number(JSON.parse(sc.theme ?? '{}').loop);
      if (Number.isFinite(loop) && loop > 0) return loopSeconds({ loop }, move, tune);
    } catch {
      /* 壞掉就用主體的預設 */
    }
  }
  return loopSeconds(SUBJECTS[subject], move, tune);
}

export const totalSeconds = (s: St = useStore.getState()) => s.scenes.reduce((a, sc) => a + sceneSeconds(sc, s), 0);

export function switchScene(id: string) {
  const s = useStore.getState();
  if (id === s.activeScene || s.hist.previewing || s.hist.showingA) return false;
  const scenes = stashActive(s);
  const target = scenes.find((x) => x.id === id);
  if (!target) return false;
  useStore.setState({ scenes, ...patchFor(target, s), wall: false });
  clock.set(0);
  return true;
}

/** 加場景：copy＝複製目前這一場；blank＝新的一場（角色跳躍＋目前的風格），之後選模板或請 Agent 生成 */
export function addScene(mode: 'copy' | 'blank'): string | null {
  const s = useStore.getState();
  if (s.scenes.length >= MAX_SCENES) return `一個專案最多 ${MAX_SCENES} 場`;
  if (s.hist.previewing) return '先處理 Agent 的修改卡（套用或放棄）';
  const scenes = stashActive(s);
  const cur = scenes.find((x) => x.id === s.activeScene)!;
  const n = scenes.length + 1;
  const sc: Scene =
    mode === 'copy'
      ? { ...structuredClone(cur), id: newId(), name: `${cur.name}（複製）`.slice(0, 40) }
      : { id: newId(), name: `場景 ${n}`, kind: 'template', mix: { ...structuredClone(cur.mix), subject: 'type' } };
  if (mode === 'blank') delete sc.chat;
  const i = scenes.findIndex((x) => x.id === s.activeScene);
  const next = [...scenes.slice(0, i + 1), sc, ...scenes.slice(i + 1)];
  useStore.setState({ scenes: next, ...patchFor(sc, s), wall: false });
  clock.set(0);
  return null;
}

export function deleteScene(id: string): string | null {
  const s = useStore.getState();
  if (s.scenes.length <= 1) return '至少要留一個場景';
  if (s.hist.previewing) return '先處理 Agent 的修改卡（套用或放棄）';
  const scenes = stashActive(s);
  const i = scenes.findIndex((x) => x.id === id);
  if (i < 0) return null;
  const next = scenes.filter((x) => x.id !== id);
  if (id !== s.activeScene) {
    useStore.setState({ scenes: next });
    return null;
  }
  const target = next[Math.min(i, next.length - 1)];
  useStore.setState({ scenes: next, ...patchFor(target, s) });
  clock.set(0);
  return null;
}

export function renameScene(id: string, name: string) {
  const n = name.trim().slice(0, 40);
  if (!n) return;
  const s = useStore.getState();
  useStore.setState({ scenes: s.scenes.map((x) => (x.id === id ? { ...x, name: n } : x)) });
}

/** 往前／往後移一格 */
export function moveScene(id: string, dir: -1 | 1) {
  const s = useStore.getState();
  const i = s.scenes.findIndex((x) => x.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.scenes.length) return;
  const next = [...s.scenes];
  [next[i], next[j]] = [next[j], next[i]];
  useStore.setState({ scenes: next });
}
