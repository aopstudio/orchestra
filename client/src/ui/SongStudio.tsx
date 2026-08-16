/**
 * SongStudio — 曲目编辑器(Phase 2): 录制 → 谱面 → 分享。
 *
 * 录制: 连接后点「开始录制」,之后所有本地弹奏(键盘/鼠标/MIDI)的按键
 * 都会按节拍网格量化记录(在 App 的 noteOn 内挂钩)。停止后可以:
 * - 命名并保存到自定义曲库(立即出现在曲库列表,可进引导/判定/谱面)
 * - 导出 JSON 文本分享给朋友;朋友导入粘贴即可拥有同一首曲子
 */

import { useState } from 'react'
import { parseAbc } from '../songs/abcParser'

export interface SongStudioProps {
  enabled: boolean
  /** 录制中(由 App 维护录制状态与音符收集)。 */
  recording: boolean
  onStartRecording: () => void
  onStopRecording: () => void
  /** 已录音符数。 */
  recordedCount: number
  /** 保存录音为曲目(title 来自输入框)。 */
  onSave: (title: string) => void
  /** 导入 JSON 文本;返回是否成功。 */
  onImport: (text: string) => boolean
  /** 导入 ABC 曲谱(解析成自定义歌曲)。 */
  onImportAbc?: (text: string) => boolean
  /** 最近一次导出文本(用于展示与复制)。 */
  exportText: string | null
  /** 分享到服务器(Phase 3): POST 当前曲目,返回分享码。 */
  onShare: () => Promise<void>
  /** 服务器返回的分享码(展示给朋友)。 */
  shareId: string | null
  /** 凭分享码取回曲目;返回是否成功。 */
  onFetchShare: (code: string) => Promise<boolean>
  /** 回放最近一次录制。 */
  onReplay: () => void
  /** 最近取回分享曲的点赞数(null = 尚未取回)。 */
  fetchedLikes: number | null
  /** 给最近取回的分享曲点赞。 */
  onLike: () => Promise<void>
}

export default function SongStudio({
  enabled,
  recording,
  onStartRecording,
  onStopRecording,
  recordedCount,
  onSave,
  onImport,
  onImportAbc,
  exportText,
  onShare,
  shareId,
  onFetchShare,
  onReplay,
  fetchedLikes,
  onLike,
}: SongStudioProps) {
  const [title, setTitle] = useState('我的新曲')
  const [importText, setImportText] = useState('')
  const [importResult, setImportResult] = useState<'ok' | 'fail' | null>(null)
  const [abcText, setAbcText] = useState('')
  const [abcPreview, setAbcPreview] = useState<{
    title: string
    bpi: number
    notes: Array<{ note: number; beat: number; duration?: number }>
  } | 'fail' | null>(null)
  const [shareCodeInput, setShareCodeInput] = useState('')
  const [fetchResult, setFetchResult] = useState<'ok' | 'fail' | null>(null)

  return (
    <section className="panel studio-panel">
      <h2 className="panel-title">
        <span>Song Studio · 录制</span>
        {recording && (
          <span className="recording-badge" data-testid="recording-badge">
            <span className="dot" />
            REC
          </span>
        )}
      </h2>

      <div className="studio-row">
        {!recording ? (
          <button
            type="button"
            className="btn btn-primary"
            data-testid="record-btn"
            disabled={!enabled}
            onClick={onStartRecording}
          >
            开始录制
          </button>
        ) : (
          <button
            type="button"
            className="btn btn-rec-stop"
            data-testid="stop-btn"
            onClick={onStopRecording}
          >
            停止录制({recordedCount} 音)
          </button>
        )}
        <span className="studio-hint" data-testid="studio-status">
          {recording
            ? `已录 ${recordedCount} 个音 · 弹奏会按节拍网格量化`
            : '录制将捕捉键盘/鼠标/MIDI 弹奏,量化到节拍网格'}
        </span>
      </div>

      {!recording && recordedCount > 0 && (
        <div className="studio-row">
          <input
            className="field-input"
            data-testid="song-title-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            spellCheck={false}
          />
          <button
            type="button"
            className="btn btn-save"
            data-testid="save-song-btn"
            onClick={() => onSave(title.trim() === '' ? '未命名曲目' : title.trim())}
          >
            保存到曲库
          </button>
          <button
            type="button"
            className="btn btn-replay"
            data-testid="replay-btn"
            onClick={onReplay}
          >
            ▶ 回放
          </button>
        </div>
      )}

      {exportText !== null && (
        <details className="studio-details">
          <summary>导出 JSON(复制发给朋友)</summary>
          <textarea
            className="studio-json"
            readOnly
            data-testid="export-text"
            value={exportText}
            onFocus={(e) => e.currentTarget.select()}
          />
        </details>
      )}

      <div className="studio-row">
        <button
          type="button"
          className="btn btn-share"
          data-testid="share-btn"
          disabled={!enabled || exportText === null}
          onClick={() => void onShare()}
        >
          分享到服务器
        </button>
        {shareId !== null && (
          <span className="studio-hint ok" data-testid="share-id">
            分享码 <b className="share-code">{shareId}</b> —— 朋友在下方凭码取回
          </span>
        )}
      </div>

      <div className="studio-row">
        <input
          className="field-input field-input-code"
          data-testid="share-code-input"
          placeholder="填入朋友的分享码"
          value={shareCodeInput}
          onChange={(e) => {
            setShareCodeInput(e.target.value.toUpperCase())
            setFetchResult(null)
          }}
          maxLength={6}
        />
        <button
          type="button"
          className="btn btn-fetch"
          data-testid="fetch-btn"
          disabled={!enabled || shareCodeInput.trim() === ''}
          onClick={() => {
            void onFetchShare(shareCodeInput).then((ok) => setFetchResult(ok ? 'ok' : 'fail'))
          }}
        >
          取回
        </button>
        {fetchResult === 'ok' && (
          <span className="studio-hint ok" data-testid="fetch-ok">
            取回成功,已加入曲库
          </span>
        )}
        {fetchResult === 'fail' && (
          <span className="studio-hint err" data-testid="fetch-fail">
            分享码无效或服务器不可达
          </span>
        )}
        {fetchedLikes !== null && (
          <button
            type="button"
            className="btn btn-like"
            data-testid="like-btn"
            onClick={() => void onLike()}
          >
            ♥ {fetchedLikes}
          </button>
        )}
      </div>

      <div className="studio-row studio-import">
        <textarea
          className="studio-json"
          data-testid="import-text"
          placeholder="粘贴朋友分享的曲目 JSON…"
          value={importText}
          onChange={(e) => {
            setImportText(e.target.value)
            setImportResult(null)
          }}
        />
        <button
          type="button"
          className="btn btn-import"
          data-testid="import-btn"
          disabled={!enabled || importText.trim() === ''}
          onClick={() => {
            setImportResult(onImport(importText) ? 'ok' : 'fail')
          }}
        >
          导入
        </button>
        {importResult === 'ok' && (
          <span className="studio-hint ok" data-testid="import-ok">
            导入成功,已加入曲库
          </span>
        )}
        {importResult === 'fail' && (
          <span className="studio-hint err" data-testid="import-fail">
            JSON 无效或结构不正确
          </span>
        )}
      </div>

      <div className="studio-row studio-import">
        <span className="field-label">导入 ABC 曲谱(简谱文本,自动转钢琴旋律)</span>
        <input
          type="file"
          accept=".abc,.txt,text/plain"
          className="abc-file-input"
          data-testid="abc-file"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (!file) return
            const reader = new FileReader()
            reader.onload = () => {
              const text = String(reader.result ?? '')
              setAbcText(text)
              setAbcPreview(parseAbc(text))
            }
            reader.readAsText(file)
            e.target.value = ''
          }}
        />
        <textarea
          className="studio-json"
          data-testid="abc-input"
          placeholder={'选择 .abc 文件,或直接粘贴 ABC 记谱…\n例如:\nX:1\nT:My Tune\nM:4/4\nL:1/4\nK:C\nC D E F G A B c |'}
          value={abcText}
          onChange={(e) => {
            setAbcText(e.target.value)
            setAbcPreview(null)
          }}
        />
        <div className="abc-preview-row">
          <button
            type="button"
            className="btn btn-import"
            data-testid="abc-preview-btn"
            disabled={!enabled || abcText.trim() === ''}
            onClick={() => setAbcPreview(parseAbc(abcText))}
          >
            解析预览
          </button>
          {abcPreview !== null && abcPreview !== 'fail' && (
            <span className="studio-hint ok" data-testid="abc-preview-info">
              「{abcPreview.title}」· {abcPreview.bpi} 拍/小节 · {abcPreview.notes.length} 个音符 · 将移调入键盘范围
            </span>
          )}
          {abcPreview === 'fail' && (
            <span className="studio-hint err" data-testid="abc-preview-fail">
              无法解析: 请检查 ABC 格式(需有 M/L/K 头和音符)
            </span>
          )}
          <button
            type="button"
            className="btn btn-primary"
            data-testid="abc-save-btn"
            disabled={!enabled || abcPreview === null || abcPreview === 'fail'}
            onClick={() => {
              if (onImportAbc?.(abcText)) {
                setAbcPreview(null)
                setAbcText('')
              } else {
                setAbcPreview('fail')
              }
            }}
          >
            保存为自定义歌曲
          </button>
        </div>
      </div>
    </section>
  )
}
