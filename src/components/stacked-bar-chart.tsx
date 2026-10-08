import { BarChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { Trans } from '@lingui/react/macro'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

echarts.use([BarChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

export interface Series {
  key: string
  name: string
  color: string
  data: number[]
}

// canvas can't read CSS vars, so resolve the theme tokens and redraw when the .dark class flips
export function useThemeTokens() {
  const read = () => {
    const css = getComputedStyle(document.documentElement)
    const v = (n: string) => css.getPropertyValue(n).trim()
    return { fg: v('--foreground'), muted: v('--muted-foreground'), border: v('--border'), input: v('--input'), popover: v('--popover'), accent: v('--accent'), card: v('--card') }
  }
  const [tokens, setTokens] = useState(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setTokens(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => obs.disconnect()
  }, [])
  return tokens
}

export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

// Stacked monthly bars: hover shows the month's breakdown, legend click hides a series, bar click picks the month
export function StackedBarChart({
  x,
  series,
  selected,
  formatX,
  formatValue,
  onPick,
  totalLabel,
}: {
  x: string[]
  series: Series[]
  selected?: string
  formatX: (x: string) => string
  formatValue: (n: number) => string
  onPick: (x: string) => void
  totalLabel: string
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts>(null)
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  })
  const c = useThemeTokens()
  const [filtered, setFiltered] = useState(false)

  useEffect(() => {
    const ch = echarts.init(el.current!)
    chart.current = ch
    ch.getZr().on('click', (e) => {
      if (!ch.containPixel('grid', [e.offsetX, e.offsetY])) return
      const i = ch.convertFromPixel({ xAxisIndex: 0 }, [e.offsetX, e.offsetY])[0]
      const month = (ch.getOption() as { xAxis: { data: string[] }[] }).xAxis[0].data[i]
      if (month) pick.current(month)
    })
    const ro = new ResizeObserver(() => ch.resize())
    ro.observe(el.current!)

    // Legend click focuses: with everything showing, a click shows only that category (ECharts has just
    // hidden it, so inverting the selection leaves it alone). Once filtered, clicks add/remove like normal,
    // and hiding the last one brings everything back.
    const selected = () => Object.values((ch.getOption() as { legend: { selected?: Record<string, boolean> }[] }).legend[0].selected ?? {})
    const sync = () => setFiltered(selected().some((v) => !v))
    ch.on('legendselectchanged', (e) => {
      const { name, selected: now } = e as { name: string; selected: Record<string, boolean> }
      const hidden = Object.entries(now)
        .filter(([, v]) => !v)
        .map(([k]) => k)
      if (hidden.length === 1 && hidden[0] === name && Object.keys(now).length > 1) ch.dispatchAction({ type: 'legendInverseSelect' })
      else if (hidden.length === Object.keys(now).length) ch.dispatchAction({ type: 'legendAllSelect' })
      sync()
    })
    return () => {
      ro.disconnect()
      ch.dispose()
    }
  }, [])

  useEffect(() => {
    const text = { color: c.muted, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 }
    chart.current?.setOption(
      {
        animationDuration: 300,
        grid: { left: 8, right: 8, top: 16, bottom: 48, containLabel: true },
        tooltip: {
          trigger: 'axis',
          appendTo: 'body', // the card clips overflow, so render the tooltip outside it
          axisPointer: { type: 'shadow', shadowStyle: { color: c.accent } },
          backgroundColor: c.popover,
          borderColor: c.input,
          textStyle: { color: c.fg, fontSize: 12 },
          extraCssText: 'border-radius:12px;box-shadow:0 8px 24px rgb(0 0 0 / 12%);border:none;',
          formatter: (params: unknown) => {
            const ps = (params as { axisValue: string; seriesName: string; data: { raw: number }; color: string }[]).filter((p) => p.data.raw)
            if (!ps.length) return ''
            const total = ps.reduce((s, p) => s + p.data.raw, 0)
            const row = (dot: string, name: string, v: string, bold = false) =>
              `<div style="display:flex;gap:16px;justify-content:space-between;${bold ? 'font-weight:600;' : ''}"><span>${dot}${esc(name)}</span><span style="font-variant-numeric:tabular-nums">${v}</span></div>`
            return [
              `<div style="margin-bottom:4px;color:${c.muted}">${esc(formatX(ps[0].axisValue))}</div>`,
              ...[...ps]
                .reverse()
                .map((p) => row(`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${p.color}"></span>`, p.seriesName, formatValue(p.data.raw))),
              `<div style="margin-top:4px;border-top:1px solid ${c.border};padding-top:4px">${row('', totalLabel, formatValue(total), true)}</div>`,
            ].join('')
          },
        },
        legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: c.fg, fontSize: 12 }, inactiveColor: c.border },
        xAxis: {
          type: 'category',
          data: x,
          axisTick: { show: false },
          axisLine: { lineStyle: { color: c.border } },
          axisLabel: { ...text, formatter: (m: string) => (m === selected ? `{sel|${formatX(m)}}` : formatX(m)), rich: { sel: { ...text, color: c.fg, fontWeight: 'bold' } } },
        },
        yAxis: { type: 'value', axisLabel: { ...text, formatter: (n: number) => formatValue(n) }, splitLine: { lineStyle: { color: c.border, type: 'dashed' } } },
        series: series.map((s) => ({
          id: s.key,
          name: s.name,
          type: 'bar',
          stack: 'total',
          // a category can net negative in a month (refunds > purchases); draw it as 0 so the axis
          // never dips below zero, while the tooltip keeps the real amount and the true total
          data: s.data.map((v) => ({ value: Math.max(0, v), raw: v })),
          barMaxWidth: 64,
          itemStyle: { color: s.color, borderColor: c.card, borderWidth: 1.5, borderRadius: 3 },
          emphasis: { focus: 'series' },
          legendHoverLink: false, // hovering a hidden legend item would otherwise blur every visible bar
        })),
      },
      { replaceMerge: ['series'] }, // keep legend on/off state across data updates
    )
  }, [x, series, selected, formatX, formatValue, totalLabel, c])

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full cursor-pointer" />
      {filtered && (
        <Button
          variant="outline"
          size="xs"
          className="absolute top-0 right-2"
          onClick={() => {
            chart.current?.dispatchAction({ type: 'legendAllSelect' })
            setFiltered(false)
          }}
        >
          <Trans>Show all</Trans>
        </Button>
      )}
    </div>
  )
}
