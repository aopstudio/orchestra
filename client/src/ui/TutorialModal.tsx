/**
 * TutorialModal — 新手教程与演奏手册(Phase 3 教学引导)。
 *
 * 首次进入自动弹出(5 步: 是什么 → 加入房间 → 演奏 → 引导 → 曲库录制);
 * 之后可通过页头「新手教程」按钮再次打开,作为演奏键位速查手册。
 */

import { useState } from 'react'

export interface TutorialModalProps {
  open: boolean
  onClose: () => void
}

interface Step {
  title: string
  body: React.ReactNode
}

const PITCH_ROWS: Array<[string, string]> = [
  ['C3–B3 白键', 'Z X C V B N M'],
  ['C3–B3 黑键', 'Q 2 3 5 6'],
  ['C4–C5 白键', 'A S D F G H J K'],
  ['C4–C5 黑键', 'W E T Y U'],
]

const DRUM_ROWS: Array<[string, string]> = [
  ['Kick 底鼓', 'A'],
  ['Snare 军鼓', 'S'],
  ['Closed / Open Hat', 'D / F'],
  ['Floor / Mid / Hi Tom', 'G / H / J'],
  ['Crash / Clap / Rim', 'K / W / E'],
]

const STEPS: Step[] = [
  {
    title: '这是什么',
    body: (
      <p>
        一个让任何人在浏览器里和朋友**一起合奏**的软件。服务器负责节拍对齐,你只需
        跟着引导弹奏,所有人听到的是同一首曲子。不需要懂乐理,不需要装软件。
      </p>
    ),
  },
  {
    title: '加入房间',
    body: (
      <>
        <p>
          房主填昵称后点「创建房间」,会得到一个 <b>6 位房间码</b>。把码告诉朋友,
          他们填码点「加入房间」,大家就进了同一间房。
        </p>
        <p>
          房间码大小写不敏感;加入不存在的房间会提示错误,可以改码重试。
        </p>
      </>
    ),
  },
  {
    title: '演奏方式',
    body: (
      <>
        <p>电脑键盘就是你的乐器(两个八度,覆盖所有内置曲目的音符):</p>
        <table className="tut-table">
          <tbody>
            {PITCH_ROWS.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td className="tut-mono">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>
          选**鼓声部**时,同一排键变成鼓垫(A=底鼓、S=军鼓、D=踩镲…);有 MIDI
          键盘的玩家可以点「连接 MIDI 键盘」直接演奏。
        </p>
      </>
    ),
  },
  {
    title: '引导与判定',
    body: (
      <>
        <p>选一首曲和一个声部后,屏幕会告诉你「现在该按什么」:</p>
        <ul className="tut-list">
          <li>
            <b>下落音符</b>: 音符条带滚动,琥珀色游标对准的就是要按的键
          </li>
          <li>
            <b>乐器高亮</b>: 琴键(或鼓垫)直接亮起——现在按哪个一目了然
          </li>
          <li>谱面模式: 五线谱渲染,光标跟随你该弹的音符(教学向)</li>
        </ul>
        <p>弹对了加分(HIT),弹错扣分(MISTAKE),漏掉记 MISS——判定可随时开关。</p>
      </>
    ),
  },
  {
    title: '曲库与录制',
    body: (
      <>
        <p>
          内置 7 首曲目(摇滚循环、十二小节布鲁斯、小星星、欢乐颂、生日快乐、
          两只老虎、划船歌),全部公有领域/原创。
        </p>
        <p>
          <b>Song Studio</b> 可以录制自己的演奏(自动量化到节拍网格),保存后立即
          成为可引导、可判定的曲目;还能导出 JSON 或分享到服务器(6 位分享码)
          发给朋友。
        </p>
      </>
    ),
  },
]

const DRUM_HINT: Step = {
  title: '鼓垫键位速查',
  body: (
    <table className="tut-table">
      <tbody>
        {DRUM_ROWS.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td className="tut-mono">{v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  ),
}

export default function TutorialModal({ open, onClose }: TutorialModalProps) {
  const [step, setStep] = useState(0)
  if (!open) return null

  const steps = [...STEPS, DRUM_HINT]
  const current = steps[Math.min(step, steps.length - 1)]!

  return (
    <div className="tut-backdrop" data-testid="tutorial-modal" onClick={onClose}>
      <div className="tut-modal" onClick={(e) => e.stopPropagation()}>
        <div className="tut-head">
          <h3>{current.title}</h3>
          <span className="tut-close-row">
            <span className="tut-progress">
              {step + 1} / {steps.length}
            </span>
            <button
              type="button"
              className="tut-close"
              data-testid="tut-close"
              aria-label="关闭教程"
              onClick={onClose}
            >
              ✕
            </button>
          </span>
        </div>
        <div className="tut-body">{current.body}</div>
        <div className="tut-actions">
          <button
            type="button"
            className="btn"
            disabled={step === 0}
            data-testid="tut-prev"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            上一步
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="tut-next"
              onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            >
              下一步
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="tut-finish"
              onClick={onClose}
            >
              开始合奏 →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
