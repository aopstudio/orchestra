/**
 * LinkUpPanel — 连接表单(服务器/昵称/房间码 + 创建/加入 + MIDI 连接)。
 * 从 App.tsx 拆出的纯展示组件。
 */

export type MidiState = 'idle' | 'unsupported' | 'error' | 'connected'
export type ConnState = 'idle' | 'connecting' | 'connected'

export interface LinkUpPanelProps {
  serverUrl: string
  onServerUrlChange: (v: string) => void
  name: string
  onNameChange: (v: string) => void
  /** NAME 输入框失焦(视为改名完成)。 */
  onNameBlur?: () => void
  roomCodeInput: string
  onRoomCodeInputChange: (v: string) => void
  connState: ConnState
  onCreate: () => void
  onJoin: () => void
  midiState: MidiState
  midiDevices: string[]
  onConnectMidi: () => void
  /** 当前所在房间码(创建/加入成功后显示,供分享给朋友)。 */
  roomCode: string | null
  onCopyRoomCode: () => void
  /** 复制按钮是否刚被点击过(显示"已复制"反馈)。 */
  copied: boolean
}

export default function LinkUpPanel({
  serverUrl,
  onServerUrlChange,
  name,
  onNameChange,
  onNameBlur,
  roomCodeInput,
  onRoomCodeInputChange,
  connState,
  onCreate,
  onJoin,
  midiState,
  midiDevices,
  onConnectMidi,
  roomCode,
  onCopyRoomCode,
  copied,
}: LinkUpPanelProps) {
  return (
    <section className="panel">
      <h2 className="panel-title">Link Up</h2>
      <form
        className="connect-form"
        onSubmit={(e) => {
          e.preventDefault()
          onCreate()
        }}
      >
        <label className="field">
          <span className="field-label">Server</span>
          <input
            className="field-input"
            value={serverUrl}
            onChange={(e) => onServerUrlChange(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Name</span>
          <input
            className="field-input"
            data-testid="name-input"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={() => onNameBlur?.()}
            spellCheck={false}
            autoComplete="off"
          />
        </label>
        <label className="field">
          <span className="field-label">Room Code</span>
          <input
            className="field-input field-input-code"
            data-testid="room-code-input"
            value={roomCodeInput}
            onChange={(e) => onRoomCodeInputChange(e.target.value.toUpperCase())}
            placeholder="加入已有房间时填写"
            spellCheck={false}
            autoComplete="off"
            maxLength={6}
          />
        </label>
        <div className="connect-actions">
          <button
            type="submit"
            className="btn btn-primary"
            data-testid="create-btn"
            disabled={connState === 'connecting'}
          >
            {connState === 'connecting' ? 'Connecting…' : '创建房间'}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="join-btn"
            disabled={connState === 'connecting' || roomCodeInput.trim() === ''}
            onClick={onJoin}
          >
            加入房间
          </button>
        </div>
        <p className="field-hint">
          创建房间后会得到 6 位房间码;把码告诉朋友,他们填码点「加入房间」。
        </p>

        {roomCode !== null && (
          <div className="room-code-callout" data-testid="room-code-callout">
            <span className="room-code-label">你的房间码 · 发给朋友</span>
            <div className="room-code-value-row">
              <span className="room-code-value" data-testid="room-code-value">
                {roomCode}
              </span>
              <button
                type="button"
                className="btn btn-copy"
                data-testid="copy-room-code"
                onClick={onCopyRoomCode}
              >
                {copied ? '已复制 ✓' : '复制'}
              </button>
            </div>
            <p className="field-hint">
              朋友在上方 Room Code 输入这 6 位码,点「加入房间」即可进你的房间。
            </p>
          </div>
        )}

        <div className="midi-row">
          <button
            type="button"
            className="btn btn-midi"
            data-testid="midi-btn"
            disabled={midiState === 'connected'}
            onClick={onConnectMidi}
          >
            {midiState === 'connected' ? 'MIDI ✓' : '连接 MIDI 键盘'}
          </button>
          {midiState === 'unsupported' && (
            <span className="midi-hint" data-testid="midi-unsupported">
              此浏览器不支持 Web MIDI(建议 Chrome/Edge),可用键盘演奏
            </span>
          )}
          {midiState === 'error' && (
            <span className="midi-hint midi-hint-error" data-testid="midi-error">
              未发现 MIDI 设备或授权被拒绝
            </span>
          )}
          {midiState === 'connected' && midiDevices.length > 0 && (
            <span className="midi-hint" data-testid="midi-devices">
              已连接: {midiDevices.join('、')}
            </span>
          )}
        </div>
      </form>
    </section>
  )
}
