/**
 * ScoreView — OSMD 总谱/分谱渲染(Phase 2,教学向)。
 *
 * - 未武装声部: 渲染整曲总谱(所有声部)
 * - 武装声部后: 渲染该声部**分谱**,并用 OSMD Cursor 做跟随高亮:
 *   每个节拍推进到当前音符(通过谱面音符的 pitch 与歌谱位置对齐)
 *
 * 实现要点:
 * - 谱面由自研 SongNote 格式经 musicXml.ts 生成,OSMD 直接 load(xml) 渲染
 * - 跟随逻辑不依赖 OSMD 内部索引,而是把「当前应弹音符」映射到光标推进次数:
 *   每次同步把 cursor 重置后推进 target 次(谱面音符按拍序,与引导引擎同源)
 * - 组件只负责渲染与跟随,不感知节拍网格;外部每 ~500ms 传入 songBeat
 */

import { useEffect, useRef, useState } from 'react'
import { OpenSheetMusicDisplay } from 'opensheetmusicdisplay'
import { songToMusicXml } from '../score/musicXml'
import type { Song, SongPart } from '../songs/songs'

export interface ScoreViewProps {
  song: Song
  /** 武装的声部(null = 渲染总谱,无跟随)。 */
  part: SongPart | null
  /** 歌曲当前位置(拍,相对歌曲起点)。 */
  songBeat: number | null
  enabled: boolean
}

/** 在声部音符序列中二分查找「当前拍位对应的音符下标」。 */
function noteIndexAt(part: SongPart, songBeat: number): number {
  const notes = part.notes
  if (notes.length === 0) return 0
  if (songBeat <= notes[0]!.beat) return 0
  // 最后一个音符结束前都在谱内
  const lastEnd = notes[notes.length - 1]!.beat + (notes[notes.length - 1]!.duration ?? 1)
  if (songBeat >= lastEnd) return notes.length - 1
  // 找到最后一个 beat <= songBeat 的音符
  let lo = 0
  let hi = notes.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if ((notes[mid]?.beat ?? 0) <= songBeat) lo = mid
    else hi = mid - 1
  }
  return lo
}

export default function ScoreView({ song, part, songBeat, enabled }: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null)
  /** 当前渲染的谱面键(歌曲 id + 声部 id),变化时重建。 */
  const scoreKey = `${song.id}:${part?.id ?? 'all'}`
  /** 光标已推进到的音符下标(跟随状态)。 */
  const cursorIndexRef = useRef(0)
  const [renderError, setRenderError] = useState<string | null>(null)

  // 谱面变化时重新生成 + 渲染
  useEffect(() => {
    const container = containerRef.current
    if (container === null || !enabled) return
    let cancelled = false
    const osmd = new OpenSheetMusicDisplay(container, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawingParameters: 'compacttight',
    })
    osmdRef.current = osmd
    cursorIndexRef.current = 0
    setRenderError(null)
    const xml = songToMusicXml(song, part !== null ? [part.id] : undefined)
    osmd
      .load(xml)
      .then(() => {
        if (cancelled) return
        osmd.render()
        // 分谱模式下启用光标跟随
        if (part !== null) {
          osmd.cursor.show()
        }
      })
      .catch((err: unknown) => {
        console.warn('[ScoreView] OSMD load failed:', err)
        if (!cancelled) setRenderError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      cancelled = true
      osmdRef.current = null
      // 清空容器,OSMD 实例由 GC 回收
      container.replaceChildren()
    }
  }, [scoreKey, enabled, song, part])

  // 跟随高亮: songBeat → 目标音符下标 → 重置并推进光标
  useEffect(() => {
    const osmd = osmdRef.current
    if (osmd === null || part === null || songBeat === null) return
    const target = noteIndexAt(part, songBeat)
    const cursor = osmd.cursor
    if (target < cursorIndexRef.current) {
      cursor.reset()
      cursorIndexRef.current = 0
    }
    while (cursorIndexRef.current < target) {
      cursor.next()
      cursorIndexRef.current += 1
    }
    cursor.show()
  }, [songBeat, part])

  return (
    <div className="score-wrap" data-testid="score-view">
      {!enabled ? (
        <p className="score-empty">连接后显示谱面</p>
      ) : (
        <>
          <div className="score-head">
            <span className="score-title">{song.title}</span>
            <span className="score-sub">
              {part === null ? '总谱 · 武装声部后显示分谱并跟随' : `分谱 · ${part.name}`}
            </span>
          </div>
          <div className="score-canvas" ref={containerRef} />
          {renderError !== null && (
            <p className="score-error">谱面渲染失败: {renderError}</p>
          )}
        </>
      )}
    </div>
  )
}
