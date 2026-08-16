/**
 * SongPicker — Phase 1 beginner song selection + part arming.
 *
 * Pure UI: lists the built-in songs (title + bpm/meter/part meta), and once a
 * song is picked, its parts (name + note count). Selecting a part "arms" the
 * guide for that part back in App. A judge toggle (like the metronome toggle)
 * and a live hit/miss/score readout live in the panel footer.
 *
 * Song selection is LOCAL for now (each player picks on their own screen); the
 * server beat grid is the shared clock, so guides stay aligned across the room
 * even though the pick itself is not broadcast. Room song sync ships later.
 */

import { useEffect, useState } from 'react'
import type { Song } from '../songs/songs'
import type { JudgeStats } from '../guide/judge'

export interface SongPickerProps {
  /** Built-in songbook. */
  songs: Song[]
  /** Currently selected song id (room-wide; driven by the host's pick) or null. */
  selectedSongId: string | null
  onSelectSong: (id: string) => void
  /** 删除自定义曲目(仅对录制/导入的歌曲显示)。 */
  onDeleteSong?: (songId: string) => void
  /** Currently armed part id (or null before a pick). */
  selectedPartId: string | null
  onSelectPart: (partId: string) => void
  /** Picking is only allowed while connected (mirrors the tempo/tsig controls). */
  enabled: boolean
  /** 选曲权: 房主或唯一在线玩家 —— 其他人只读房主选的歌。 */
  canSelectSong: boolean
  /** 我是否为房主(「开始倒计时」按钮仅房主可见)。 */
  isOwner: boolean
  /** Song playback progress 0..1 (from the guide engine) — drives the amber line. */
  progress?: number
  /** Whether note judgment is active. */
  judgeEnabled?: boolean
  onToggleJudge?: () => void
  /** Live judgment tally shown in the panel footer. */
  judgeStats?: JudgeStats
  /** Countdown beats left before the armed song starts (null = already playing). */
  countdownBeatsLeft?: number | null
  /** Restart the armed song from the top (re-runs the countdown). */
  onRestart?: () => void
  /** Per-song BPM overrides (song id → bpm); falls back to the song default. */
  songBpmOverrides?: Record<string, number>
  /** Change a song's default tempo (persisted + applied to the room). */
  onSongBpmChange?: (songId: string, bpm: number) => void
  /** 引导模式: 下落音符(滚动条)或虚拟乐器高亮(琴键/鼓垫)。 */
  guideMode?: 'ticker' | 'highlight'
  onGuideModeChange?: (mode: 'ticker' | 'highlight') => void
  /** 谱面(OSMD 总谱/分谱)开关。 */
  showScore?: boolean
  onToggleScore?: () => void
  /** 请求房间同步开始(仅房主;服务器校验所有在线玩家已准备)。 */
  onSyncStart?: () => void
  /** 房间合奏编排状态(房主/歌曲/声部认领/成员准备)。 */
  ensemble?: {
    songId: string | null
    bpi: number
    ownerId: string
    parts: Array<{ partId: string; playerId: string; playerName: string; ready: boolean }>
    members: Array<{ playerId: string; playerName: string; ready: boolean }>
  } | null
  /** 我的玩家 id(判断认领归属)。 */
  myId?: string | null
  /** 我是否已准备。 */
  myReady?: boolean
  onToggleReady?: () => void
  /** 编排开始是否就绪(房主 + 有人认领 + 所有在线玩家已准备)。 */
  canStart?: boolean
}

/** Compact meta line under each song title. */
function songMeta(song: Song): string {
  const partNames = song.parts.map((p) => p.name).join(' + ')
  return `${song.bpm} bpm · ${song.bpi}/4 · ${partNames}`
}

export default function SongPicker({
  songs,
  selectedSongId,
  onSelectSong,
  onDeleteSong,
  selectedPartId,
  onSelectPart,
  enabled,
  canSelectSong,
  isOwner,
  progress = 0,
  judgeEnabled = true,
  onToggleJudge,
  judgeStats,
  countdownBeatsLeft = null,
  onRestart,
  songBpmOverrides = {},
  onSongBpmChange,
  guideMode = 'ticker',
  onGuideModeChange,
  showScore = false,
  onToggleScore,
  onSyncStart,
  ensemble = null,
  myId = null,
  myReady = false,
  onToggleReady,
  canStart = false,
}: SongPickerProps) {
  const selectedSong = songs.find((s) => s.id === selectedSongId) ?? null
  const armed = selectedPartId !== null
  // 与自由合奏/速度面板一致: 可折叠,默认收起(演奏时腾出视线),状态持久化。
  const [open, setOpen] = useState(() => localStorage.getItem('orch.panel.songbook') === '1')
  useEffect(() => {
    localStorage.setItem('orch.panel.songbook', open ? '1' : '0')
  }, [open])
  const progressPct = Math.max(0, Math.min(100, Math.round(progress * 100)))
  const selectedBpm =
    selectedSong !== null ? (songBpmOverrides[selectedSong.id] ?? selectedSong.bpm) : null
  // 编排状态: 房间歌曲的认领表(partId → 认领信息)
  const roomEnsemble = ensemble !== null && ensemble.songId === selectedSong?.id ? ensemble : null
  const claimOf = (partId: string) =>
    roomEnsemble?.parts.find((p) => p.partId === partId) ?? null
  const myHasClaim = roomEnsemble?.parts.some((p) => p.playerId === myId) ?? false

  return (
    <section className="panel songbook-panel">
      <h2 className="panel-title">
        <button
          type="button"
          className="panel-title-toggle"
          data-testid="song-panel-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span className="panel-chevron">▶</span>
          <span>曲库</span>
          {selectedSong !== null && <span className="songbook-current">{selectedSong.title}</span>}
          {(armed || (countdownBeatsLeft ?? 0) > 0) && (
            <span className="panel-title-dot" data-testid="song-panel-status" />
          )}
        </button>
        {armed ? (
          <span className="songbook-armed">
            <span className="dot" />
            已认领
          </span>
        ) : (
          <span className="kbd-hint">认领声部开始引导</span>
        )}
      </h2>

      {open && (
        <>
          {!canSelectSong && (
            <p className="songbook-hint" data-testid="song-pick-locked">
              🔒 由房主选曲 · 选定后即可认领声部
            </p>
          )}
          <div className="songbook-list" role="radiogroup" aria-label="Songs">
        {songs.map((song) => {
          const active = song.id === selectedSongId
          // 自定义曲目(录制/ABC/MusicXML 导入)才显示删除按钮
          const isCustom =
            song.id.startsWith('custom-') || song.id.startsWith('abc-') || song.id.startsWith('mxml-')
          return (
            <div key={song.id} className="song-row-wrap">
              <button
                type="button"
                className={active ? 'song-row song-row-active' : 'song-row'}
                data-testid={`song-${song.id}`}
                disabled={!enabled || !canSelectSong}
                aria-pressed={active}
                title={canSelectSong ? (active ? '再点一下取消选曲' : '选择这首歌(全房间同步)') : '仅房主可选曲'}
                onClick={() => onSelectSong(song.id)}
              >
                <span className="song-row-name">{song.title}</span>
                <span className="song-row-meta">{songMeta(song)}</span>
              </button>
              {isCustom && onDeleteSong !== undefined && (
                <button
                  type="button"
                  className="song-delete"
                  data-testid={`song-delete-${song.id}`}
                  title="删除这首自定义曲目"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteSong(song.id)
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>

      {selectedSong !== null && (
        <div className="songbook-parts">
          <span className="field-label">Parts · 声部(再点一下取消)</span>
          <div
            className="tsig-pills"
            role="radiogroup"
            aria-label={`Parts of ${selectedSong.title}`}
          >
            {selectedSong.parts.map((part) => {
              const claim = claimOf(part.id)
              const mine = claim !== null && claim.playerId === myId
              const taken = claim !== null && !mine
              const active = part.id === selectedPartId
              return (
                <button
                  key={part.id}
                  type="button"
                  className={
                    (active ? 'tsig-pill tsig-pill-active ' : 'tsig-pill ') +
                    'part-pill' +
                    (taken ? ' part-pill-taken' : '') +
                    (mine ? ' part-pill-mine' : '')
                  }
                  data-testid={`part-${selectedSong.id}-${part.id}`}
                  disabled={!enabled || taken}
                  aria-pressed={active}
                  onClick={() => onSelectPart(part.id)}
                  title={
                    taken
                      ? `已被 ${claim?.playerName ?? ''} 选中`
                      : mine
                        ? '我认领的声部'
                        : '点击认领该声部'
                  }
                >
                  {part.name}
                  <em>
                    {taken
                      ? `${claim?.playerName} 已选${claim?.ready ? ' ✓' : ''}`
                      : mine
                        ? `${claim?.ready ? '已准备 ✓' : '我 · 待准备'}`
                        : `${part.notes.length} n`}
                  </em>
                </button>
              )
            })}
          </div>
          <div className="songbook-progress" aria-hidden="true">
            <span className="songbook-progress-fill" style={{ width: `${progressPct}%` }} />
          </div>

          {selectedBpm !== null && (
            <div className="song-bpm-row">
              <span className="field-label">曲速 BPM</span>
              <button
                type="button"
                className="song-bpm-btn"
                data-testid={`song-bpm-down-${selectedSong.id}`}
                disabled={!enabled}
                onClick={() => onSongBpmChange?.(selectedSong.id, selectedBpm - 5)}
              >
                −5
              </button>
              <span className="song-bpm-value" data-testid={`song-bpm-value-${selectedSong.id}`}>
                {selectedBpm}
              </span>
              <button
                type="button"
                className="song-bpm-btn"
                data-testid={`song-bpm-up-${selectedSong.id}`}
                disabled={!enabled}
                onClick={() => onSongBpmChange?.(selectedSong.id, selectedBpm + 5)}
              >
                +5
              </button>
              <span className="song-bpm-hint">选曲时全房间跟随 · 演奏中可改</span>
            </div>
          )}
        </div>
      )}

      <div className="guide-mode-row">
        <span className="field-label">Guide · 引导</span>
        <div className="tsig-pills" role="group" aria-label="Guide mode">
          <button
            type="button"
            className={guideMode === 'ticker' ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
            data-testid="guide-mode-ticker"
            aria-pressed={guideMode === 'ticker'}
            onClick={() => onGuideModeChange?.('ticker')}
          >
            下落音符
          </button>
          <button
            type="button"
            className={guideMode === 'highlight' ? 'tsig-pill tsig-pill-active' : 'tsig-pill'}
            data-testid="guide-mode-highlight"
            aria-pressed={guideMode === 'highlight'}
            onClick={() => onGuideModeChange?.('highlight')}
          >
            乐器高亮
          </button>
          <button
            type="button"
            className={`tsig-pill${showScore ? ' tsig-pill-active' : ''}`}
            data-testid="score-toggle"
            aria-pressed={showScore}
            onClick={() => onToggleScore?.()}
          >
            谱面
          </button>
        </div>
      </div>

      <div className="songbook-foot">
        <button
          type="button"
          className={`judge-toggle${judgeEnabled ? ' judge-toggle-on' : ''}`}
          data-testid="judge-toggle"
          aria-pressed={judgeEnabled}
          onClick={() => onToggleJudge?.()}
        >
          <span className="judge-toggle-dot" />
          Judgment {judgeEnabled ? 'ON' : 'OFF'}
        </button>
        {judgeStats !== undefined && (
          <span className="judge-stats" data-testid="judge-stats">
            HIT <b>{judgeStats.hits}</b> · MISS <b>{judgeStats.misses}</b> · MISTAKE{' '}
            <b>{judgeStats.mistakes}</b> · <em>{judgeStats.score} pts</em>
          </span>
        )}
      </div>

      {/* 在线玩家准备区: 选曲后所有在线玩家可见(未认领声部的玩家也能点「准备」) */}
      {ensemble !== null && ensemble.songId !== null && (
        <div className="ensemble-members" data-testid="ensemble-members">
          <span className="field-label">玩家准备</span>
          {ensemble.members.map((m) => (
            <span key={m.playerId} className={`member-row${m.ready ? ' member-ready' : ''}`}>
              <span className="member-dot" />
              {m.playerName}
              {m.playerId === myId && <em>(我)</em>}
              <span className="member-ready-text">{m.ready ? '已准备 ✓' : '…'}</span>
            </span>
          ))}
          <button
            type="button"
            className={`ready-btn${myReady ? ' ready-btn-on' : ''}`}
            data-testid="ready-btn"
            disabled={!enabled}
            aria-pressed={myReady}
            onClick={() => onToggleReady?.()}
          >
            <span className="ready-dot" />
            {myReady ? '我已准备 ✓' : '准备就绪'}
          </button>
        </div>
      )}

      {armed && (
        <div className="songbook-actions">
          {countdownBeatsLeft !== null && countdownBeatsLeft > 0 && (
            <span className="songbook-countdown" data-testid="songbook-countdown">
              准备 · <b>{countdownBeatsLeft}</b>
            </span>
          )}

          {/* 开始倒计时: 仅房主可见;所有在线玩家准备后可用 */}
          {isOwner && (
            <button
              type="button"
              className="btn btn-primary sync-start-btn"
              data-testid="sync-start-btn"
              disabled={!enabled || !canStart}
              onClick={() => onSyncStart?.()}
              title={
                canStart
                  ? '全房间在预备小节后统一起奏'
                  : '需要所有在线玩家都准备就绪'
              }
            >
              ▶ 开始倒计时
            </button>
          )}
          {!canStart && isOwner && !myReady && (
            <span className="songbook-hint" data-testid="sync-start-hint">
              等所有在线玩家点「准备就绪」后即可开始
            </span>
          )}
          {/* 重新开始: 仅房主可见(与「开始倒计时」同一权限) */}
          {isOwner && (
            <button
              type="button"
              className="restart-btn"
              data-testid="restart-btn"
              disabled={!enabled}
              onClick={() => onRestart?.()}
            >
              ↻ 重新开始
            </button>
          )}
        </div>
      )}

      <p className="songbook-note" data-testid="ensemble-note">
        房间模式: 房主选曲 → 每人认领一个声部(互斥)→ 所有玩家「准备就绪」→ 房主开始倒计时,
        全房间同步起奏。点已选的歌曲/声部可取消。
      </p>
        </>
      )}
    </section>
  )
}
