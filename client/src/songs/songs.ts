/**
 * 内置曲库(Phase 1 引导模式)
 *
 * 谱面格式设计兼顾后期 MIDI 导入:
 * - 音符用 MIDI note 号 + 相对歌曲起点的拍位(小数拍)表示
 * - 每首歌一个 tempo / 拍号,多个声部(part)
 * - 拍位对齐到服务器节拍网格,由 guideEngine 推进
 *
 * 所有曲目均为公有领域 / 原创,避免版权问题。
 */

export interface SongNote {
  /** MIDI 音符号(0–127) */
  note: number
  /** 相对歌曲起点的拍位(小数拍,基于歌曲自身 bpm/bpi 网格) */
  beat: number
  /** 时值(拍),默认 1 拍 */
  duration?: number
  /** 力度(0–127),默认 100 */
  velocity?: number
}

export interface SongPart {
  /** 声部 id(房间内选声部用) */
  id: string
  /** 声部显示名 */
  name: string
  /** 该声部的音符序列(按 beat 升序) */
  notes: SongNote[]
}

export interface Song {
  id: string
  title: string
  /** 歌曲自身速度(BPM) */
  bpm: number
  /** 拍号:每小节拍数 */
  bpi: number
  parts: SongPart[]
}

/**
 * 小星星(旋律 + 简单低音伴奏)
 * C 大调,4/4 拍,120 BPM。旋律为传统公有领域童谣。
 * 旋律: C C G G A A G | F F E E D D C
 * 低音: 每小节根音长音(C/G/F/C)
 */
const TWINKLE: Song = {
  id: 'twinkle',
  title: '小星星',
  bpm: 120,
  bpi: 4,
  parts: [
    {
      id: 'melody',
      name: '旋律',
      notes: [
        // 第 1 小节: C C G G A A G
        { note: 60, beat: 0 },
        { note: 60, beat: 1 },
        { note: 67, beat: 2 },
        { note: 67, beat: 3 },
        { note: 69, beat: 4 },
        { note: 69, beat: 5 },
        { note: 67, beat: 6, duration: 2 },
        // 第 2 小节: F F E E D D C
        { note: 65, beat: 8 },
        { note: 65, beat: 9 },
        { note: 64, beat: 10 },
        { note: 64, beat: 11 },
        { note: 62, beat: 12 },
        { note: 62, beat: 13 },
        { note: 60, beat: 14, duration: 2 },
        // 第 3 小节: G G F F E E D
        { note: 67, beat: 16 },
        { note: 67, beat: 17 },
        { note: 65, beat: 18 },
        { note: 65, beat: 19 },
        { note: 64, beat: 20 },
        { note: 64, beat: 21 },
        { note: 62, beat: 22, duration: 2 },
        // 第 4 小节: G G F F E E D
        { note: 67, beat: 24 },
        { note: 67, beat: 25 },
        { note: 65, beat: 26 },
        { note: 65, beat: 27 },
        { note: 64, beat: 28 },
        { note: 64, beat: 29 },
        { note: 62, beat: 30, duration: 2 },
        // 第 5-6 小节: C C G G A A G | F F E E D D C
        { note: 60, beat: 32 },
        { note: 60, beat: 33 },
        { note: 67, beat: 34 },
        { note: 67, beat: 35 },
        { note: 69, beat: 36 },
        { note: 69, beat: 37 },
        { note: 67, beat: 38, duration: 2 },
        { note: 65, beat: 40 },
        { note: 65, beat: 41 },
        { note: 64, beat: 42 },
        { note: 64, beat: 43 },
        { note: 62, beat: 44 },
        { note: 62, beat: 45 },
        { note: 60, beat: 46, duration: 2 },
      ],
    },
    {
      id: 'bass',
      name: '低音',
      notes: [
        { note: 48, beat: 0, duration: 4 }, // C2 长音
        { note: 53, beat: 4, duration: 4 }, // F2
        { note: 55, beat: 8, duration: 4 }, // G2
        { note: 48, beat: 12, duration: 4 }, // C2
        { note: 55, beat: 16, duration: 4 }, // G2
        { note: 53, beat: 20, duration: 4 }, // F2
        { note: 55, beat: 24, duration: 4 }, // G2
        { note: 48, beat: 28, duration: 4 }, // C2
        { note: 48, beat: 32, duration: 4 },
        { note: 53, beat: 36, duration: 4 },
        { note: 55, beat: 40, duration: 4 },
        { note: 48, beat: 44, duration: 4 },
      ],
    },
  ],
}

/**
 * 欢乐颂(贝多芬第九交响曲主题,公有领域)
 * C 大调,4/4 拍,90 BPM。
 * 旋律: E E F G | G F E D | C C D E | E D D
 */
const ODE_TO_JOY: Song = {
  id: 'ode-to-joy',
  title: '欢乐颂',
  bpm: 90,
  bpi: 4,
  parts: [
    {
      id: 'melody',
      name: '旋律',
      notes: [
        // E E F G
        { note: 64, beat: 0 },
        { note: 64, beat: 1 },
        { note: 65, beat: 2 },
        { note: 67, beat: 3 },
        // G F E D
        { note: 67, beat: 4 },
        { note: 65, beat: 5 },
        { note: 64, beat: 6 },
        { note: 62, beat: 7 },
        // C C D E
        { note: 60, beat: 8 },
        { note: 60, beat: 9 },
        { note: 62, beat: 10 },
        { note: 64, beat: 11 },
        // E D D
        { note: 64, beat: 12, duration: 2 },
        { note: 62, beat: 14, duration: 2 },
        // E E F G (repeat)
        { note: 64, beat: 16 },
        { note: 64, beat: 17 },
        { note: 65, beat: 18 },
        { note: 67, beat: 19 },
        { note: 67, beat: 20 },
        { note: 65, beat: 21 },
        { note: 64, beat: 22 },
        { note: 62, beat: 23 },
        { note: 60, beat: 24 },
        { note: 60, beat: 25 },
        { note: 62, beat: 26 },
        { note: 64, beat: 27 },
        { note: 64, beat: 28, duration: 2 },
        { note: 62, beat: 30, duration: 2 },
      ],
    },
    {
      id: 'bass',
      name: '低音',
      notes: [
        { note: 48, beat: 0, duration: 4 },
        { note: 53, beat: 4, duration: 4 },
        { note: 48, beat: 8, duration: 4 },
        { note: 55, beat: 12, duration: 4 },
        { note: 48, beat: 16, duration: 4 },
        { note: 53, beat: 20, duration: 4 },
        { note: 48, beat: 24, duration: 4 },
        { note: 55, beat: 28, duration: 4 },
      ],
    },
  ],
}

/** 内置曲库(按 id 索引) */
export const SONGS: Song[] = [TWINKLE, ODE_TO_JOY]

export function getSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id)
}
