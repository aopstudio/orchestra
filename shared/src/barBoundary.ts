/**
 * 小节边界数学(shared): 歌曲倒计时与房间同步开始共用。
 *
 * 歌曲必须从节拍器重音(即 bpi 整数倍的服务器拍)开始,倒计时因此结束在
 * 小节边界而非固定拍数后。同步开始模式下,服务器以同一公式广播边界拍,
 * 保证全房间玩家的歌曲起点一致。
 */

/**
 * 下一个小节边界拍(bpi 的整数倍),至少 `minAhead` 拍之后。
 * 歌曲从这里开始,第一拍落在节拍器重音上。
 */
export function nextBarBoundary(beat: number, bpi: number, minAhead = 1): number {
  const target = beat + Math.max(1, minAhead)
  return Math.ceil(target / bpi) * bpi
}
