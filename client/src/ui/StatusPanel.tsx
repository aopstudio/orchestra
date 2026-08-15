/**
 * StatusPanel — live validation readouts for the Phase 0 sync prototype.
 *
 * Three readout cells:
 *   ① key→sound latency  (from the scheduler's output-timestamp estimate)
 *   ② clock offset + last sync RTT + sync count  (from NTP-style estimation)
 *   ③ authoritative server beat + BPM  (from the room's clock broadcast)
 *
 * Plus the connection badge, the peer roster, and any surfaced errors.
 */

export type ConnState = 'idle' | 'connecting' | 'connected'

export interface Peer {
  id: string
  name: string
}

export interface StatusPanelProps {
  connState: ConnState
  serverUrl: string
  /** 所在房间码(welcome 下发后展示,供分享给队友)。 */
  roomCode: string | null
  myName: string
  myId: string | null
  peers: Peer[]
  latencyMs: number | null
  clockOffsetMs: number
  syncDelayMs: number
  syncCount: number
  beat: number | null
  bpm: number
  bpi: number
  error: string | null
}

const BADGE: Record<ConnState, { label: string; className: string }> = {
  idle: { label: 'OFFLINE', className: 'badge-off' },
  connecting: { label: 'CONNECTING', className: 'badge-busy' },
  connected: { label: 'CONNECTED', className: 'badge-on' },
}

/** A single labelled readout cell: big tabular number + optional sub-line. */
function Readout({
  label,
  value,
  unit,
  sub,
  tone,
  testid,
}: {
  label: string
  value: string
  unit?: string
  sub?: string
  tone: 'amber' | 'cyan' | 'ink'
  testid?: string
}) {
  return (
    <div className={`readout readout-${tone}`} data-testid={testid}>
      <span className="readout-label">{label}</span>
      <span className="readout-value">
        {value}
        {unit !== undefined && <em>{unit}</em>}
      </span>
      {sub !== undefined && <span className="readout-sub">{sub}</span>}
    </div>
  )
}

export default function StatusPanel(props: StatusPanelProps) {
  const {
    connState,
    serverUrl,
    roomCode,
    myName,
    myId,
    peers,
    latencyMs,
    clockOffsetMs,
    syncDelayMs,
    syncCount,
    beat,
    bpm,
    bpi,
    error,
  } = props

  const badge = BADGE[connState]
  // The server only announces peers that join after us, and never announces
  // ourselves back — filter defensively in case a relay includes self.
  const otherPeers = myId === null ? peers : peers.filter((p) => p.id !== myId)
  const offsetText =
    clockOffsetMs > 0 ? `+${Math.round(clockOffsetMs)}` : `${Math.round(clockOffsetMs)}`
  // Cumulative server beat → 1-based bar + beat-within-bar. The beat is
  // fractional (it advances continuously), so floor both before display.
  const bar = beat === null ? null : Math.floor(beat / bpi) + 1
  const beatInBar = beat === null ? null : Math.floor(beat % bpi) + 1
  const sub = `BAR ${bar ?? '—'} · ${bpm} BPM · every ${Math.round(60000 / bpm)} ms`

  return (
    <section className="panel">
      <h2 className="panel-title">
        <span>状态</span>
        <span className={`badge ${badge.className}`} data-testid="conn-badge">
          <span className="dot" />
          {badge.label}
        </span>
      </h2>

      <div className="status-stack">
        <div className="status-identity">
          <b>{myName}</b> · {myId === null ? '未加入' : `id ${myId.slice(0, 8)}`}
          <br />
          {serverUrl}
          {roomCode !== null && (
            <span className="room-code" data-testid="room-code">
              {' '}
              · ROOM <b>{roomCode}</b>
            </span>
          )}
        </div>

        <div className="readouts">
          <Readout
            label="① 按键→出声"
            value={latencyMs === null ? '—' : `${Math.round(latencyMs)}`}
            unit={latencyMs === null ? undefined : 'ms'}
            tone="amber"
            sub="输出时间戳估算"
            testid="readout-latency"
          />
          <Readout
            label="② 时钟偏移"
            value={offsetText}
            unit="ms"
            tone="cyan"
            sub={`RTT ${Math.round(syncDelayMs)} ms · ${syncCount} sync${syncCount === 1 ? '' : 's'}`}
            testid="readout-offset"
          />
          <Readout
            label="③ 服务器节拍"
            value={beatInBar === null ? '—' : `${beatInBar}`}
            unit={beatInBar === null ? undefined : `/ ${bpi}`}
            tone="ink"
            sub={sub}
            testid="readout-beat"
          />
        </div>

        <div className="status-row">
          <span>ROOM</span>
          <span>
            {otherPeers.length} other player{otherPeers.length === 1 ? '' : 's'}
          </span>
        </div>
        {otherPeers.length === 0 ? (
          <span className="peers-empty">no other players in the room yet</span>
        ) : (
          <div className="peers" data-testid="peers">
            {otherPeers.map((p) => (
              <span className="peer-chip" key={p.id}>
                ▣ {p.name}
              </span>
            ))}
          </div>
        )}

        {error !== null && (
          <div className="error" data-testid="error-box">
            {error}
          </div>
        )}
      </div>
    </section>
  )
}
