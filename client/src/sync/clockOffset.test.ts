import { describe, expect, it } from 'vitest'
import { average, computeDelay, computeOffset, estimateOffset, filterSamples } from './clockOffset'

describe('computeOffset', () => {
  it('recovers the exact offset with symmetric RTT when the server clock is 100ms behind the client', () => {
    // Convention: offset = serverClock - clientClock.
    // Server clock = client clock - 100ms, RTT = 40ms => 20ms travel each way:
    //   client sends at t1 = 0            (client clock)
    //   server receives at t2 = -80       (server clock: -100 + 20)
    //   server replies at t3 = -80        (server clock)
    //   client receives at t4 = 40        (client clock)
    // offset = ((t2 - t1) + (t3 - t4)) / 2 = (-80 + -120) / 2 = -100
    expect(computeOffset(0, -80, -80, 40)).toBe(-100)
  })

  it('recovers the correct offset with asymmetric RTT', () => {
    // 30ms outbound, 10ms return; server clock still 100ms behind client:
    //   t1 = 0, t2 = -90, t3 = -90, t4 = 10
    // offset = ((-90) + (-90 - 10)) / 2 = -95
    expect(computeOffset(0, -90, -90, 10)).toBe(-95)
  })

  it('returns 0 when both clocks agree', () => {
    // Clocks in lockstep, 20ms travel each way.
    expect(computeOffset(0, 20, 20, 40)).toBe(0)
  })
})

describe('computeDelay', () => {
  it('returns the symmetric RTT', () => {
    expect(computeDelay(0, -80, -80, 40)).toBe(40)
  })

  it('returns the asymmetric RTT', () => {
    expect(computeDelay(0, -90, -90, 10)).toBe(10)
  })
})

describe('filterSamples', () => {
  it('keeps only samples strictly below the threshold', () => {
    expect(filterSamples([5, 6, 500, 7], 50)).toEqual([5, 6, 7])
  })

  it('keeps nothing when every sample is at or above the threshold', () => {
    expect(filterSamples([50, 51], 50)).toEqual([])
  })
})

describe('average', () => {
  it('returns the mean of a non-empty array', () => {
    expect(average([10, 20, 30])).toBe(20)
  })
})

describe('estimateOffset', () => {
  it('averages the offsets of valid samples and drops high-delay ones', async () => {
    const samples = [
      { t1: 0, t2: -80, t3: -80, t4: 40 }, // offset -100, delay 40
      { t1: 0, t2: -90, t3: -90, t4: 10 }, // offset -95,  delay 10
      { t1: 0, t2: -80, t3: -80, t4: 300 }, // delay 300 -> dropped (>= 50)
      { t1: 0, t2: -70, t3: -70, t4: 40 }, // offset -90,  delay 40
      { t1: 0, t2: -80, t3: -80, t4: 40 }, // offset -100, delay 40
    ]
    let call = 0
    const sendSync = async () => {
      const sample = samples[call]
      call += 1
      if (sample === undefined) throw new Error('out of samples')
      return sample
    }

    const estimate = await estimateOffset(sendSync)

    // Valid offsets: [-100, -95, -90, -100] -> -385 / 4 = -96.25
    expect(estimate.offset).toBe(-96.25)
    // Valid delays: [40, 10, 40, 40] -> 130 / 4 = 32.5
    expect(estimate.delay).toBe(32.5)
  })

  it('throws when every sample exceeds maxDelayMs', async () => {
    const sendSync = async () => ({ t1: 0, t2: -80, t3: -80, t4: 300 })
    await expect(estimateOffset(sendSync)).rejects.toThrow('no valid sync samples')
  })

  it('honors custom samples count and maxDelayMs', async () => {
    const samples = [
      { t1: 0, t2: -80, t3: -80, t4: 40 }, // delay 40 -> dropped with maxDelayMs 30
      { t1: 0, t2: -80, t3: -80, t4: 20 }, // offset -90, delay 20
      { t1: 0, t2: -80, t3: -80, t4: 20 }, // offset -90, delay 20
    ]
    let call = 0
    const sendSync = async () => {
      const sample = samples[call]
      call += 1
      if (sample === undefined) throw new Error('out of samples')
      return sample
    }

    const estimate = await estimateOffset(sendSync, { samples: 3, maxDelayMs: 30 })

    expect(estimate.offset).toBe(-90)
    expect(estimate.delay).toBe(20)
  })
})
