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

import type { Song, SongNote, SongPart } from '@orchestra/shared'

export type { Song, SongNote, SongPart }

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
      instrument: 'piano',
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
      instrument: 'piano',
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
      instrument: 'piano',
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
      instrument: 'piano',
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

/**
 * 摇滚循环(原创,三声部: 鼓 + 贝斯 + 键盘)
 * A 小调,A–F–C–G 进行,4/4,120 BPM,8 小节循环(32 拍)。
 *
 * - 鼓: 基础摇滚节奏(kick 1/3 拍、snare 2/4 拍、hat 每拍),第 4、8 小节加 tom 填充
 * - 贝斯: 每小节根音的八分音符驱动(A2/F2/C3/G2)
 * - 键盘: A 小调五声音阶 riff(每两小节一个动机,跟随和声)
 *
 * 鼓件用 GM 鼓图(35–51);选该声部时键盘切换为鼓垫模式(见 input/keyboard.ts)。
 */
const ROCK_GROOVE: Song = {
  id: 'rock-groove',
  title: '摇滚循环 Rock Groove',
  bpm: 120,
  bpi: 4,
  parts: [
    {
      id: 'drums',
      name: '鼓',
      instrument: 'drums',
      notes: [
        // 第 1–3 小节(0–11 拍): kick 1/3、snare 2/4、hat 每拍
        { note: 36, beat: 0 }, // kick
        { note: 38, beat: 1 }, // snare
        { note: 42, beat: 2 }, // hat
        { note: 38, beat: 3 }, // snare
        { note: 36, beat: 4 },
        { note: 38, beat: 5 },
        { note: 42, beat: 6 },
        { note: 38, beat: 7 },
        { note: 36, beat: 8 },
        { note: 38, beat: 9 },
        { note: 42, beat: 10 },
        { note: 38, beat: 11 },
        // 第 4 小节(12–15): tom 填充
        { note: 36, beat: 12 },
        { note: 38, beat: 13 },
        { note: 45, beat: 14 }, // mid tom
        { note: 48, beat: 15 }, // high tom
        // 第 5–7 小节(16–27): 同 1–3
        { note: 36, beat: 16 },
        { note: 38, beat: 17 },
        { note: 42, beat: 18 },
        { note: 38, beat: 19 },
        { note: 36, beat: 20 },
        { note: 38, beat: 21 },
        { note: 42, beat: 22 },
        { note: 38, beat: 23 },
        { note: 36, beat: 24 },
        { note: 38, beat: 25 },
        { note: 42, beat: 26 },
        { note: 38, beat: 27 },
        // 第 8 小节(28–31): 结尾加 crash
        { note: 36, beat: 28 },
        { note: 38, beat: 29 },
        { note: 49, beat: 30, duration: 2 }, // crash
        { note: 38, beat: 31 },
      ],
    },
    {
      id: 'bass',
      name: '贝斯',
      instrument: 'bass',
      notes: [
        // 八分音符根音(每小节 8 个): Am F C G | Am F C G
        { note: 57, beat: 0 }, { note: 57, beat: 0.5 },
        { note: 57, beat: 1 }, { note: 57, beat: 1.5 },
        { note: 57, beat: 2 }, { note: 57, beat: 2.5 },
        { note: 57, beat: 3 }, { note: 57, beat: 3.5 },
        { note: 53, beat: 4 }, { note: 53, beat: 4.5 },
        { note: 53, beat: 5 }, { note: 53, beat: 5.5 },
        { note: 53, beat: 6 }, { note: 53, beat: 6.5 },
        { note: 53, beat: 7 }, { note: 53, beat: 7.5 },
        { note: 60, beat: 8 }, { note: 60, beat: 8.5 },
        { note: 60, beat: 9 }, { note: 60, beat: 9.5 },
        { note: 60, beat: 10 }, { note: 60, beat: 10.5 },
        { note: 60, beat: 11 }, { note: 60, beat: 11.5 },
        { note: 55, beat: 12 }, { note: 55, beat: 12.5 },
        { note: 55, beat: 13 }, { note: 55, beat: 13.5 },
        { note: 55, beat: 14 }, { note: 55, beat: 14.5 },
        { note: 55, beat: 15 }, { note: 55, beat: 15.5 },
        { note: 57, beat: 16 }, { note: 57, beat: 16.5 },
        { note: 57, beat: 17 }, { note: 57, beat: 17.5 },
        { note: 57, beat: 18 }, { note: 57, beat: 18.5 },
        { note: 57, beat: 19 }, { note: 57, beat: 19.5 },
        { note: 53, beat: 20 }, { note: 53, beat: 20.5 },
        { note: 53, beat: 21 }, { note: 53, beat: 21.5 },
        { note: 53, beat: 22 }, { note: 53, beat: 22.5 },
        { note: 53, beat: 23 }, { note: 53, beat: 23.5 },
        { note: 60, beat: 24 }, { note: 60, beat: 24.5 },
        { note: 60, beat: 25 }, { note: 60, beat: 25.5 },
        { note: 60, beat: 26 }, { note: 60, beat: 26.5 },
        { note: 60, beat: 27 }, { note: 60, beat: 27.5 },
        { note: 55, beat: 28 }, { note: 55, beat: 28.5 },
        { note: 55, beat: 29 }, { note: 55, beat: 29.5 },
        { note: 55, beat: 30 }, { note: 55, beat: 30.5 },
        { note: 55, beat: 31 }, { note: 55, beat: 31.5 },
      ],
    },
    {
      id: 'keys',
      name: '键盘',
      instrument: 'piano',
      notes: [
        // A 小调五声音阶 riff(跟随和声,每小节 4 个四分音符)
        // 第 1 小节(Am): A C D E
        { note: 57, beat: 0 }, { note: 60, beat: 1 },
        { note: 62, beat: 2 }, { note: 64, beat: 3 },
        // 第 2 小节(F): C D A C
        { note: 60, beat: 4 }, { note: 62, beat: 5 },
        { note: 57, beat: 6 }, { note: 60, beat: 7 },
        // 第 3 小节(C): C D E G
        { note: 60, beat: 8 }, { note: 62, beat: 9 },
        { note: 64, beat: 10 }, { note: 67, beat: 11 },
        // 第 4 小节(G): G A B D
        { note: 55, beat: 12 }, { note: 57, beat: 13 },
        { note: 59, beat: 14 }, { note: 62, beat: 15 },
        // 第 5–8 小节: 重复 1–4
        { note: 57, beat: 16 }, { note: 60, beat: 17 },
        { note: 62, beat: 18 }, { note: 64, beat: 19 },
        { note: 60, beat: 20 }, { note: 62, beat: 21 },
        { note: 57, beat: 22 }, { note: 60, beat: 23 },
        { note: 60, beat: 24 }, { note: 62, beat: 25 },
        { note: 64, beat: 26 }, { note: 67, beat: 27 },
        { note: 55, beat: 28 }, { note: 57, beat: 29 },
        { note: 59, beat: 30 }, { note: 62, beat: 31 },
      ],
    },
  ],
}

/**
 * 生日快乐(公有领域)
 * C 大调,3/4 拍,96 BPM。旋律 + 根音低音。
 */
const HAPPY_BIRTHDAY: Song = {
  id: 'happy-birthday',
  title: '生日快乐',
  bpm: 96,
  bpi: 3,
  parts: [
    {
      id: 'melody',
      name: '旋律',
      instrument: 'piano',
      notes: [
        // 5 5 6 5 8 7- | 5 5 6 5 9 8- | 5 5 10 8 7 6 | 11 11 10 8 9 8-
        { note: 67, beat: 0 }, { note: 67, beat: 1 }, { note: 69, beat: 2 },
        { note: 67, beat: 3 }, { note: 72, beat: 4 }, { note: 71, beat: 5, duration: 2 },
        { note: 67, beat: 6 }, { note: 67, beat: 7 }, { note: 69, beat: 8 },
        { note: 67, beat: 9 }, { note: 74, beat: 10 }, { note: 72, beat: 11, duration: 2 },
        { note: 67, beat: 12 }, { note: 67, beat: 13 }, { note: 76, beat: 14 },
        { note: 72, beat: 15 }, { note: 71, beat: 16 }, { note: 69, beat: 17 },
        { note: 77, beat: 18 }, { note: 77, beat: 19 }, { note: 76, beat: 20 },
        { note: 72, beat: 21 }, { note: 74, beat: 22 }, { note: 72, beat: 23, duration: 2 },
      ],
    },
    {
      id: 'bass',
      name: '低音',
      instrument: 'piano',
      notes: [
        { note: 48, beat: 0, duration: 3 },
        { note: 55, beat: 3, duration: 3 },
        { note: 48, beat: 6, duration: 3 },
        { note: 53, beat: 9, duration: 3 },
        { note: 48, beat: 12, duration: 3 },
        { note: 55, beat: 15, duration: 3 },
        { note: 48, beat: 18, duration: 3 },
        { note: 48, beat: 21, duration: 3 },
      ],
    },
  ],
}

/**
 * 两只老虎 / 雅克兄弟(公有领域轮唱曲)
 * C 大调,4/4 拍,110 BPM。旋律 + 根音低音。
 */
const FRERE_JACQUES: Song = {
  id: 'frere-jacques',
  title: '两只老虎',
  bpm: 110,
  bpi: 4,
  parts: [
    {
      id: 'melody',
      name: '旋律',
      instrument: 'piano',
      notes: [
        // 1 2 3 1 | 1 2 3 1 | 3 4 5- | 3 4 5-
        { note: 60, beat: 0 }, { note: 62, beat: 1 }, { note: 64, beat: 2 }, { note: 60, beat: 3 },
        { note: 60, beat: 4 }, { note: 62, beat: 5 }, { note: 64, beat: 6 }, { note: 60, beat: 7 },
        { note: 64, beat: 8 }, { note: 65, beat: 9 }, { note: 67, beat: 10, duration: 2 },
        { note: 64, beat: 12 }, { note: 65, beat: 13 }, { note: 67, beat: 14, duration: 2 },
        // 5 6 5 4 3 1 | 5 6 5 4 3 1
        { note: 69, beat: 16 }, { note: 67, beat: 17 }, { note: 65, beat: 18 }, { note: 64, beat: 19 },
        { note: 64, beat: 20 }, { note: 60, beat: 21 },
        { note: 69, beat: 22 }, { note: 67, beat: 23 }, { note: 65, beat: 24 }, { note: 64, beat: 25 },
        { note: 64, beat: 26 }, { note: 60, beat: 27 },
        // 2 5 1- | 2 5 1-
        { note: 62, beat: 28 }, { note: 55, beat: 29 }, { note: 60, beat: 30, duration: 2 },
        { note: 62, beat: 32 }, { note: 55, beat: 33 }, { note: 60, beat: 34, duration: 2 },
      ],
    },
    {
      id: 'bass',
      name: '低音',
      instrument: 'piano',
      notes: [
        { note: 48, beat: 0, duration: 4 },
        { note: 48, beat: 4, duration: 4 },
        { note: 48, beat: 8, duration: 4 },
        { note: 53, beat: 12, duration: 4 },
        { note: 53, beat: 16, duration: 4 },
        { note: 48, beat: 20, duration: 4 },
        { note: 55, beat: 24, duration: 4 },
        { note: 48, beat: 28, duration: 4 },
        { note: 48, beat: 32, duration: 4 },
      ],
    },
  ],
}

/**
 * 划船歌(公有领域童谣,节奏简化)
 * C 大调,4/4 拍,108 BPM。旋律 + 根音低音。
 */
const ROW_BOAT: Song = {
  id: 'row-boat',
  title: '划船歌',
  bpm: 108,
  bpi: 4,
  parts: [
    {
      id: 'melody',
      name: '旋律',
      instrument: 'piano',
      notes: [
        // 1 1 1 2 | 3 3 2 3 | 4 5 8- | 8 8 5 5 | 5 3 3 1 | 1 5 4 3 | 2 1-
        { note: 60, beat: 0 }, { note: 60, beat: 1 }, { note: 60, beat: 2 }, { note: 62, beat: 3 },
        { note: 64, beat: 4 }, { note: 64, beat: 5 }, { note: 62, beat: 6 }, { note: 64, beat: 7 },
        { note: 65, beat: 8 }, { note: 67, beat: 9 }, { note: 72, beat: 10, duration: 2 },
        { note: 72, beat: 12 }, { note: 72, beat: 13 }, { note: 67, beat: 14 }, { note: 67, beat: 15 },
        { note: 67, beat: 16 }, { note: 64, beat: 17 }, { note: 64, beat: 18 }, { note: 60, beat: 19 },
        { note: 60, beat: 20 }, { note: 67, beat: 21 }, { note: 65, beat: 22 }, { note: 64, beat: 23 },
        { note: 62, beat: 24 }, { note: 60, beat: 25, duration: 2 },
      ],
    },
    {
      id: 'bass',
      name: '低音',
      instrument: 'piano',
      notes: [
        { note: 48, beat: 0, duration: 4 },
        { note: 55, beat: 4, duration: 4 },
        { note: 48, beat: 8, duration: 4 },
        { note: 53, beat: 12, duration: 4 },
        { note: 48, beat: 16, duration: 4 },
        { note: 48, beat: 20, duration: 4 },
        { note: 55, beat: 24, duration: 4 },
      ],
    },
  ],
}

/**
 * 十二小节布鲁斯(原创)
 * C 调,4/4 拍,100 BPM,12 小节: C7 F7 C7 C7 | F7 F7 C7 C7 | G7 F7 C7 G7
 * 鼓: 摇摆底鼓/军鼓/踩镲;贝斯: 根音行走;键盘: 布鲁斯 riff。
 */
const BLUES_12BAR: Song = {
  id: 'blues-12bar',
  title: '十二小节布鲁斯',
  bpm: 100,
  bpi: 4,
  parts: [
    {
      id: 'drums',
      name: '鼓',
      instrument: 'drums',
      notes: [
        // 摇摆节奏: kick 1/3 拍、snare 2/4 拍、hat 每拍(按拍序生成)
        ...Array.from({ length: 12 }, (_, bar) => {
          const b = bar * 4
          const notes: SongNote[] = []
          for (let i = 0; i < 4; i += 1) {
            if (i === 0 || i === 2) notes.push({ note: 36, beat: b + i }) // kick
            if (i === 1 || i === 3) notes.push({ note: 38, beat: b + i }) // snare
            notes.push({ note: 42, beat: b + i }) // closed hat
          }
          return notes
        }).flat(),
      ],
    },
    {
      id: 'bass',
      name: '贝斯',
      instrument: 'bass',
      notes: [
        // 行走贝斯(根音 + 过音),每小节 4 个四分音符
        // C: 48 50 52 53 | F: 53 52 50 48 | G: 55 54 52 50
        { note: 48, beat: 0 }, { note: 50, beat: 1 }, { note: 52, beat: 2 }, { note: 53, beat: 3 },
        { note: 53, beat: 4 }, { note: 52, beat: 5 }, { note: 50, beat: 6 }, { note: 48, beat: 7 },
        { note: 48, beat: 8 }, { note: 50, beat: 9 }, { note: 52, beat: 10 }, { note: 53, beat: 11 },
        { note: 48, beat: 12 }, { note: 50, beat: 13 }, { note: 52, beat: 14 }, { note: 53, beat: 15 },
        { note: 53, beat: 16 }, { note: 52, beat: 17 }, { note: 50, beat: 18 }, { note: 48, beat: 19 },
        { note: 53, beat: 20 }, { note: 52, beat: 21 }, { note: 50, beat: 22 }, { note: 48, beat: 23 },
        { note: 48, beat: 24 }, { note: 50, beat: 25 }, { note: 52, beat: 26 }, { note: 53, beat: 27 },
        { note: 48, beat: 28 }, { note: 50, beat: 29 }, { note: 52, beat: 30 }, { note: 53, beat: 31 },
        { note: 55, beat: 32 }, { note: 54, beat: 33 }, { note: 52, beat: 34 }, { note: 50, beat: 35 },
        { note: 53, beat: 36 }, { note: 52, beat: 37 }, { note: 50, beat: 38 }, { note: 48, beat: 39 },
        { note: 55, beat: 40 }, { note: 54, beat: 41 }, { note: 52, beat: 42 }, { note: 50, beat: 43 },
        { note: 55, beat: 44 }, { note: 53, beat: 45 }, { note: 50, beat: 46 }, { note: 48, beat: 47 },
      ],
    },
    {
      id: 'keys',
      name: '键盘',
      instrument: 'piano',
      notes: [
        // 布鲁斯 riff(每小节两拍一组): 降三级 → 根音 → 五级
        { note: 63, beat: 0 }, { note: 60, beat: 1 }, { note: 67, beat: 2 }, { note: 63, beat: 3 },
        { note: 65, beat: 4 }, { note: 65, beat: 5 }, { note: 72, beat: 6 }, { note: 65, beat: 7 },
        { note: 63, beat: 8 }, { note: 60, beat: 9 }, { note: 67, beat: 10 }, { note: 63, beat: 11 },
        { note: 63, beat: 12 }, { note: 60, beat: 13 }, { note: 67, beat: 14 }, { note: 63, beat: 15 },
        { note: 65, beat: 16 }, { note: 65, beat: 17 }, { note: 72, beat: 18 }, { note: 65, beat: 19 },
        { note: 65, beat: 20 }, { note: 65, beat: 21 }, { note: 72, beat: 22 }, { note: 65, beat: 23 },
        { note: 63, beat: 24 }, { note: 60, beat: 25 }, { note: 67, beat: 26 }, { note: 63, beat: 27 },
        { note: 63, beat: 28 }, { note: 60, beat: 29 }, { note: 67, beat: 30 }, { note: 63, beat: 31 },
        { note: 67, beat: 32 }, { note: 67, beat: 33 }, { note: 74, beat: 34 }, { note: 67, beat: 35 },
        { note: 65, beat: 36 }, { note: 65, beat: 37 }, { note: 72, beat: 38 }, { note: 65, beat: 39 },
        { note: 67, beat: 40 }, { note: 67, beat: 41 }, { note: 74, beat: 42 }, { note: 67, beat: 43 },
        { note: 67, beat: 44 }, { note: 63, beat: 45 }, { note: 60, beat: 46 }, { note: 62, beat: 47 },
      ],
    },
  ],
}

/**
 * 号角合奏(原创铜管编制: 小号×2 + 大号)
 * C 大调,4/4 拍,100 BPM。英雄式号角动机,两声部三度叠置 + 根音低音。
 */
const FANFARE: Song = {
  id: 'fanfare',
  title: '号角合奏',
  bpm: 100,
  bpi: 4,
  parts: [
    {
      id: 't1',
      name: '小号 1',
      instrument: 'trumpet',
      notes: [
        { note: 60, beat: 0 }, { note: 67, beat: 1 }, { note: 72, beat: 2 }, { note: 76, beat: 3 },
        { note: 72, beat: 4, duration: 2 }, { note: 67, beat: 6 }, { note: 60, beat: 7 },
        { note: 60, beat: 8 }, { note: 67, beat: 9 }, { note: 72, beat: 10 }, { note: 76, beat: 11 },
        { note: 79, beat: 12, duration: 2 }, { note: 76, beat: 14 }, { note: 72, beat: 15 },
        { note: 67, beat: 16, duration: 2 }, { note: 72, beat: 18 }, { note: 67, beat: 19 },
        { note: 60, beat: 20, duration: 4 },
      ],
    },
    {
      id: 't2',
      name: '小号 2',
      instrument: 'trumpet',
      notes: [
        { note: 64, beat: 0 }, { note: 64, beat: 1 }, { note: 67, beat: 2 }, { note: 72, beat: 3 },
        { note: 67, beat: 4, duration: 2 }, { note: 64, beat: 6 }, { note: 64, beat: 7 },
        { note: 64, beat: 8 }, { note: 64, beat: 9 }, { note: 67, beat: 10 }, { note: 72, beat: 11 },
        { note: 76, beat: 12, duration: 2 }, { note: 72, beat: 14 }, { note: 67, beat: 15 },
        { note: 64, beat: 16, duration: 2 }, { note: 67, beat: 18 }, { note: 64, beat: 19 },
        { note: 60, beat: 20, duration: 4 },
      ],
    },
    {
      id: 'tuba',
      name: '大号',
      instrument: 'bass',
      notes: [
        { note: 48, beat: 0, duration: 4 },
        { note: 55, beat: 4, duration: 4 },
        { note: 48, beat: 8, duration: 4 },
        { note: 53, beat: 12, duration: 4 },
        { note: 48, beat: 16, duration: 4 },
        { note: 55, beat: 20, duration: 4 },
      ],
    },
  ],
}

/**
 * 弦乐小夜曲(原创弦乐编制: 小提琴×2 + 低音)
 * C 大调,4/4 拍,90 BPM。抒情旋律 + 三度叠置和声 + 根音低音。
 */
const SERENADE: Song = {
  id: 'serenade',
  title: '弦乐小夜曲',
  bpm: 90,
  bpi: 4,
  parts: [
    {
      id: 'v1',
      name: '小提琴 1',
      instrument: 'violin',
      notes: [
        { note: 67, beat: 0 }, { note: 69, beat: 1 }, { note: 72, beat: 2, duration: 2 },
        { note: 74, beat: 4 }, { note: 72, beat: 5 }, { note: 69, beat: 6, duration: 2 },
        { note: 67, beat: 8 }, { note: 69, beat: 9 }, { note: 72, beat: 10, duration: 2 },
        { note: 74, beat: 12, duration: 2 }, { note: 76, beat: 14 }, { note: 74, beat: 15 },
        { note: 72, beat: 16, duration: 2 }, { note: 69, beat: 18 }, { note: 67, beat: 19 },
        { note: 69, beat: 20, duration: 2 }, { note: 67, beat: 22 }, { note: 65, beat: 23 },
        { note: 64, beat: 24, duration: 4 },
      ],
    },
    {
      id: 'v2',
      name: '小提琴 2',
      instrument: 'violin',
      notes: [
        { note: 64, beat: 0 }, { note: 64, beat: 1 }, { note: 67, beat: 2, duration: 2 },
        { note: 71, beat: 4 }, { note: 69, beat: 5 }, { note: 64, beat: 6, duration: 2 },
        { note: 64, beat: 8 }, { note: 64, beat: 9 }, { note: 67, beat: 10, duration: 2 },
        { note: 71, beat: 12, duration: 2 }, { note: 72, beat: 14 }, { note: 71, beat: 15 },
        { note: 69, beat: 16, duration: 2 }, { note: 65, beat: 18 }, { note: 64, beat: 19 },
        { note: 65, beat: 20, duration: 2 }, { note: 64, beat: 22 }, { note: 62, beat: 23 },
        { note: 60, beat: 24, duration: 4 },
      ],
    },
    {
      id: 'cello',
      name: '低音',
      instrument: 'bass',
      notes: [
        { note: 48, beat: 0, duration: 4 },
        { note: 53, beat: 4, duration: 4 },
        { note: 48, beat: 8, duration: 4 },
        { note: 53, beat: 12, duration: 4 },
        { note: 48, beat: 16, duration: 4 },
        { note: 53, beat: 20, duration: 4 },
        { note: 48, beat: 24, duration: 4 },
      ],
    },
  ],
}

/**
 * 铃儿响叮当(公有领域圣诞曲)——四乐器合奏
 * C 大调,4/4 拍,132 BPM,16 小节(64 拍)。
 * 编制: 小号(旋律) + 钢琴(分解和弦) + 贝斯(根音) + 鼓(轻快节奏)。
 * 旋律为传统公有领域旋律,简谱: 3 3 3 | 3 3 3 | 3 5 1 2 | 3 | 4 4 4 4 | 4 3 3 3 | 3 2 2 3 | 2 5 ...
 */
const JINGLE_BELLS: Song = {
  id: 'jingle-bells',
  title: '铃儿响叮当',
  bpm: 132,
  bpi: 4,
  parts: [
    {
      id: 'melody',
      name: '小号 · 旋律',
      instrument: 'trumpet',
      notes: [
        // A 段 (m1-m8)
        { note: 64, beat: 0 }, { note: 64, beat: 1 }, { note: 64, beat: 2 },
        { note: 64, beat: 4 }, { note: 64, beat: 5 }, { note: 64, beat: 6 },
        { note: 64, beat: 8 }, { note: 67, beat: 9 }, { note: 72, beat: 10 }, { note: 74, beat: 11 },
        { note: 76, beat: 12, duration: 2 },
        { note: 77, beat: 16 }, { note: 77, beat: 17 }, { note: 77, beat: 18 }, { note: 77, beat: 19 },
        { note: 77, beat: 20 }, { note: 76, beat: 21 }, { note: 76, beat: 22 }, { note: 76, beat: 23 },
        { note: 76, beat: 24 }, { note: 74, beat: 25 }, { note: 74, beat: 26 }, { note: 76, beat: 27 },
        { note: 74, beat: 28, duration: 2 }, { note: 67, beat: 30, duration: 2 },
        // A' 段 (m9-m16)
        { note: 64, beat: 32 }, { note: 64, beat: 33 }, { note: 64, beat: 34 },
        { note: 64, beat: 36 }, { note: 64, beat: 37 }, { note: 64, beat: 38 },
        { note: 64, beat: 40 }, { note: 67, beat: 41 }, { note: 72, beat: 42 }, { note: 74, beat: 43 },
        { note: 76, beat: 44, duration: 2 },
        { note: 77, beat: 48 }, { note: 77, beat: 49 }, { note: 77, beat: 50 }, { note: 77, beat: 51 },
        { note: 77, beat: 52 }, { note: 76, beat: 53 }, { note: 76, beat: 54 }, { note: 76, beat: 55 },
        { note: 67, beat: 56 }, { note: 67, beat: 57 }, { note: 65, beat: 58 }, { note: 62, beat: 59 },
        { note: 60, beat: 60, duration: 4 },
      ],
    },
    {
      id: 'harmony',
      name: '钢琴 · 和声',
      instrument: 'piano',
      notes: [
        // 每小节一拍一个分解和弦音(C / F / G)
        { note: 60, beat: 0 }, { note: 64, beat: 1 }, { note: 67, beat: 2 }, { note: 64, beat: 3 },
        { note: 60, beat: 4 }, { note: 64, beat: 5 }, { note: 67, beat: 6 }, { note: 64, beat: 7 },
        { note: 60, beat: 8 }, { note: 67, beat: 9 }, { note: 72, beat: 10 }, { note: 67, beat: 11 },
        { note: 60, beat: 12 }, { note: 64, beat: 13 }, { note: 67, beat: 14 }, { note: 64, beat: 15 },
        { note: 53, beat: 16 }, { note: 57, beat: 17 }, { note: 60, beat: 18 }, { note: 57, beat: 19 },
        { note: 53, beat: 20 }, { note: 57, beat: 21 }, { note: 60, beat: 22 }, { note: 57, beat: 23 },
        { note: 55, beat: 24 }, { note: 59, beat: 25 }, { note: 62, beat: 26 }, { note: 59, beat: 27 },
        { note: 55, beat: 28 }, { note: 59, beat: 29 }, { note: 62, beat: 30 }, { note: 59, beat: 31 },
        // A' 段重复
        { note: 60, beat: 32 }, { note: 64, beat: 33 }, { note: 67, beat: 34 }, { note: 64, beat: 35 },
        { note: 60, beat: 36 }, { note: 64, beat: 37 }, { note: 67, beat: 38 }, { note: 64, beat: 39 },
        { note: 60, beat: 40 }, { note: 67, beat: 41 }, { note: 72, beat: 42 }, { note: 67, beat: 43 },
        { note: 60, beat: 44 }, { note: 64, beat: 45 }, { note: 67, beat: 46 }, { note: 64, beat: 47 },
        { note: 53, beat: 48 }, { note: 57, beat: 49 }, { note: 60, beat: 50 }, { note: 57, beat: 51 },
        { note: 53, beat: 52 }, { note: 57, beat: 53 }, { note: 60, beat: 54 }, { note: 57, beat: 55 },
        { note: 67, beat: 56 }, { note: 67, beat: 57 }, { note: 65, beat: 58 }, { note: 62, beat: 59 },
        { note: 60, beat: 60 }, { note: 64, beat: 61 }, { note: 67, beat: 62 }, { note: 72, beat: 63 },
      ],
    },
    {
      id: 'bass',
      name: '贝斯 · 低音',
      instrument: 'bass',
      notes: [
        // 每小节根音两拍一换: C C | F F | G G ...
        { note: 48, beat: 0, duration: 2 }, { note: 48, beat: 2, duration: 2 },
        { note: 48, beat: 4, duration: 2 }, { note: 48, beat: 6, duration: 2 },
        { note: 48, beat: 8, duration: 2 }, { note: 48, beat: 10, duration: 2 },
        { note: 48, beat: 12, duration: 2 }, { note: 48, beat: 14, duration: 2 },
        { note: 53, beat: 16, duration: 2 }, { note: 53, beat: 18, duration: 2 },
        { note: 53, beat: 20, duration: 2 }, { note: 53, beat: 22, duration: 2 },
        { note: 55, beat: 24, duration: 2 }, { note: 55, beat: 26, duration: 2 },
        { note: 55, beat: 28, duration: 2 }, { note: 55, beat: 30, duration: 2 },
        { note: 48, beat: 32, duration: 2 }, { note: 48, beat: 34, duration: 2 },
        { note: 48, beat: 36, duration: 2 }, { note: 48, beat: 38, duration: 2 },
        { note: 48, beat: 40, duration: 2 }, { note: 48, beat: 42, duration: 2 },
        { note: 48, beat: 44, duration: 2 }, { note: 48, beat: 46, duration: 2 },
        { note: 53, beat: 48, duration: 2 }, { note: 53, beat: 50, duration: 2 },
        { note: 53, beat: 52, duration: 2 }, { note: 53, beat: 54, duration: 2 },
        { note: 55, beat: 56, duration: 2 }, { note: 55, beat: 58, duration: 2 },
        { note: 48, beat: 60, duration: 4 },
      ],
    },
    {
      id: 'drums',
      name: '鼓 · 节奏',
      instrument: 'drums',
      notes: [
        // 轻快摇滚: kick 1/3 拍、snare 2/4 拍、closed hat 每拍
        ...Array.from({ length: 16 }, (_, bar) => {
          const b = bar * 4
          const notes: SongNote[] = []
          for (let i = 0; i < 4; i += 1) {
            if (i === 0 || i === 2) notes.push({ note: 36, beat: b + i }) // kick
            if (i === 1 || i === 3) notes.push({ note: 38, beat: b + i }) // snare
            notes.push({ note: 42, beat: b + i }) // closed hat
          }
          return notes
        }).flat(),
      ],
    },
  ],
}

/**
 * 卡农 · 帕赫贝尔(公有领域)——三声部弦乐对位
 * D 大调,4/4 拍,90 BPM,8 小节(32 拍)。
 * 编制: 小提琴 1(主题) + 小提琴 2(三度叠置) + 低音(经典卡农低音线 D A B F# | G D G A)。
 */
const CANON: Song = {
  id: 'canon',
  title: '卡农 · 帕赫贝尔',
  bpm: 90,
  bpi: 4,
  parts: [
    {
      id: 'v1',
      name: '小提琴 1',
      instrument: 'violin',
      notes: [
        { note: 66, beat: 0, duration: 2 }, { note: 69, beat: 2, duration: 2 },
        { note: 64, beat: 4, duration: 2 }, { note: 67, beat: 6, duration: 2 },
        { note: 62, beat: 8, duration: 2 }, { note: 66, beat: 10, duration: 2 },
        { note: 61, beat: 12, duration: 2 }, { note: 64, beat: 14, duration: 2 },
        { note: 59, beat: 16, duration: 2 }, { note: 62, beat: 18, duration: 2 },
        { note: 57, beat: 20, duration: 2 }, { note: 61, beat: 22, duration: 2 },
        { note: 55, beat: 24, duration: 2 }, { note: 59, beat: 26, duration: 2 },
        { note: 57, beat: 28, duration: 4 },
      ],
    },
    {
      id: 'v2',
      name: '小提琴 2',
      instrument: 'violin',
      notes: [
        { note: 62, beat: 0, duration: 2 }, { note: 66, beat: 2, duration: 2 },
        { note: 61, beat: 4, duration: 2 }, { note: 64, beat: 6, duration: 2 },
        { note: 59, beat: 8, duration: 2 }, { note: 62, beat: 10, duration: 2 },
        { note: 57, beat: 12, duration: 2 }, { note: 61, beat: 14, duration: 2 },
        { note: 55, beat: 16, duration: 2 }, { note: 59, beat: 18, duration: 2 },
        { note: 54, beat: 20, duration: 2 }, { note: 57, beat: 22, duration: 2 },
        { note: 52, beat: 24, duration: 2 }, { note: 55, beat: 26, duration: 2 },
        { note: 54, beat: 28, duration: 4 },
      ],
    },
    {
      id: 'bass',
      name: '低音 · 卡农线',
      instrument: 'bass',
      notes: [
        // D A B F# | G D G A —— 8 拍循环 × 4
        { note: 50, beat: 0 }, { note: 57, beat: 1 }, { note: 59, beat: 2 }, { note: 54, beat: 3 },
        { note: 55, beat: 4 }, { note: 50, beat: 5 }, { note: 55, beat: 6 }, { note: 57, beat: 7 },
        { note: 50, beat: 8 }, { note: 57, beat: 9 }, { note: 59, beat: 10 }, { note: 54, beat: 11 },
        { note: 55, beat: 12 }, { note: 50, beat: 13 }, { note: 55, beat: 14 }, { note: 57, beat: 15 },
        { note: 50, beat: 16 }, { note: 57, beat: 17 }, { note: 59, beat: 18 }, { note: 54, beat: 19 },
        { note: 55, beat: 20 }, { note: 50, beat: 21 }, { note: 55, beat: 22 }, { note: 57, beat: 23 },
        { note: 50, beat: 24 }, { note: 57, beat: 25 }, { note: 59, beat: 26 }, { note: 54, beat: 27 },
        { note: 55, beat: 28 }, { note: 50, beat: 29 }, { note: 55, beat: 30 }, { note: 57, beat: 31 },
      ],
    },
  ],
}

/**
 * 友谊地久天长(公有领域民谣)——四乐器合奏
 * C 大调,4/4 拍,100 BPM,8 小节(32 拍)。
 * 编制: 小号(旋律) + 小提琴(三度和声) + 贝斯(根音) + 鼓(轻柔节奏)。
 */
const AULD_LANG_SYNE: Song = {
  id: 'auld-lang-syne',
  title: '友谊地久天长',
  bpm: 100,
  bpi: 4,
  parts: [
    {
      id: 'melody',
      name: '小号 · 旋律',
      instrument: 'trumpet',
      notes: [
        { note: 60, beat: 0 }, { note: 60, beat: 1 }, { note: 67, beat: 2 }, { note: 69, beat: 3 },
        { note: 69, beat: 4 }, { note: 67, beat: 5 }, { note: 64, beat: 6 }, { note: 60, beat: 7 },
        { note: 67, beat: 8 }, { note: 67, beat: 9 }, { note: 69, beat: 10 }, { note: 69, beat: 11 },
        { note: 67, beat: 12, duration: 2 }, { note: 64, beat: 14, duration: 2 },
        { note: 60, beat: 16 }, { note: 60, beat: 17 }, { note: 67, beat: 18 }, { note: 69, beat: 19 },
        { note: 69, beat: 20 }, { note: 67, beat: 21 }, { note: 64, beat: 22 }, { note: 60, beat: 23 },
        { note: 67, beat: 24 }, { note: 67, beat: 25 }, { note: 64, beat: 26 }, { note: 62, beat: 27 },
        { note: 60, beat: 28, duration: 4 },
      ],
    },
    {
      id: 'harmony',
      name: '小提琴 · 和声',
      instrument: 'violin',
      notes: [
        // 旋律上方三度
        { note: 64, beat: 0 }, { note: 64, beat: 1 }, { note: 71, beat: 2 }, { note: 72, beat: 3 },
        { note: 72, beat: 4 }, { note: 71, beat: 5 }, { note: 67, beat: 6 }, { note: 64, beat: 7 },
        { note: 71, beat: 8 }, { note: 71, beat: 9 }, { note: 72, beat: 10 }, { note: 72, beat: 11 },
        { note: 71, beat: 12, duration: 2 }, { note: 67, beat: 14, duration: 2 },
        { note: 64, beat: 16 }, { note: 64, beat: 17 }, { note: 71, beat: 18 }, { note: 72, beat: 19 },
        { note: 72, beat: 20 }, { note: 71, beat: 21 }, { note: 67, beat: 22 }, { note: 64, beat: 23 },
        { note: 71, beat: 24 }, { note: 71, beat: 25 }, { note: 67, beat: 26 }, { note: 65, beat: 27 },
        { note: 64, beat: 28, duration: 4 },
      ],
    },
    {
      id: 'bass',
      name: '贝斯 · 低音',
      instrument: 'bass',
      notes: [
        { note: 48, beat: 0, duration: 2 }, { note: 55, beat: 2, duration: 2 },
        { note: 53, beat: 4, duration: 2 }, { note: 48, beat: 6, duration: 2 },
        { note: 48, beat: 8, duration: 2 }, { note: 53, beat: 10, duration: 2 },
        { note: 55, beat: 12, duration: 2 }, { note: 48, beat: 14, duration: 2 },
        { note: 48, beat: 16, duration: 2 }, { note: 55, beat: 18, duration: 2 },
        { note: 53, beat: 20, duration: 2 }, { note: 48, beat: 22, duration: 2 },
        { note: 55, beat: 24, duration: 2 }, { note: 55, beat: 26, duration: 2 },
        { note: 48, beat: 28, duration: 4 },
      ],
    },
    {
      id: 'drums',
      name: '鼓 · 节奏',
      instrument: 'drums',
      notes: [
        // 轻柔进行曲: kick 1/3、snare 2/4、hat 每拍
        ...Array.from({ length: 8 }, (_, bar) => {
          const b = bar * 4
          const notes: SongNote[] = []
          for (let i = 0; i < 4; i += 1) {
            if (i === 0 || i === 2) notes.push({ note: 36, beat: b + i })
            if (i === 1 || i === 3) notes.push({ note: 38, beat: b + i })
            notes.push({ note: 42, beat: b + i })
          }
          return notes
        }).flat(),
      ],
    },
  ],
}

/** 内置曲库(按 id 索引) */
export const SONGS: Song[] = [
  JINGLE_BELLS,
  CANON,
  AULD_LANG_SYNE,
  ROCK_GROOVE,
  BLUES_12BAR,
  TWINKLE,
  ODE_TO_JOY,
  HAPPY_BIRTHDAY,
  FRERE_JACQUES,
  ROW_BOAT,
  FANFARE,
  SERENADE,
]

export function getSong(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id)
}
