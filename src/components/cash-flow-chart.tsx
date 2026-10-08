import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import * as echarts from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { useEffect, useRef } from 'react'
import { esc, useThemeTokens } from '@/components/stacked-bar-chart'

echarts.use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const INCOME = '#30d158'
const SPENDING = '#ff375f'

// Income up, spending down from zero, net as a line; bar click picks the month
export function CashFlowChart({
  x,
  income,
  spending,
  selected,
  labels,
  formatX,
  formatValue,
  onPick,
}: {
  x: string[]
  income: number[]
  spending: number[]
  selected?: string
  labels: { income: string; spending: string; net: string }
  formatX: (x: string) => string
  formatValue: (n: number) => string
  onPick: (x: string) => void
}) {
  const el = useRef<HTMLDivElement>(null)
  const chart = useRef<echarts.ECharts>(null)
  const pick = useRef(onPick)
  useEffect(() => {
    pick.current = onPick
  })
  const c = useThemeTokens()

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
    return () => {
      ro.disconnect()
      ch.dispose()
    }
  }, [])

  useEffect(() => {
    const text = { color: c.muted, fontFamily: getComputedStyle(document.body).fontFamily, fontSize: 11 }
    const net = x.map((_, i) => income[i] - spending[i])
    chart.current?.setOption({
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
          const i = (params as { dataIndex: number }[])[0]?.dataIndex
          if (i === undefined) return ''
          const row = (color: string, name: string, v: number, bold = false) =>
            `<div style="display:flex;gap:16px;justify-content:space-between;${bold ? 'font-weight:600;' : ''}"><span>${color ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px;background:${color}"></span>` : ''}${esc(name)}</span><span style="font-variant-numeric:tabular-nums">${formatValue(v)}</span></div>`
          return [
            `<div style="margin-bottom:4px;color:${c.muted}">${esc(formatX(x[i]))}</div>`,
            row(INCOME, labels.income, income[i]),
            row(SPENDING, labels.spending, spending[i]),
            `<div style="margin-top:4px;border-top:1px solid ${c.border};padding-top:4px">${row('', labels.net, net[i], true)}</div>`,
          ].join('')
        },
      },
      legend: { bottom: 0, icon: 'circle', itemWidth: 10, itemHeight: 10, textStyle: { color: c.fg, fontSize: 12 }, inactiveColor: c.border },
      xAxis: {
        type: 'category',
        data: x,
        axisTick: { show: false },
        axisLine: { onZero: true, lineStyle: { color: c.border } },
        axisLabel: { ...text, formatter: (m: string) => (m === selected ? `{sel|${formatX(m)}}` : formatX(m)), rich: { sel: { ...text, color: c.fg, fontWeight: 'bold' } } },
      },
      yAxis: { type: 'value', axisLabel: { ...text, formatter: (n: number) => formatValue(n) }, splitLine: { lineStyle: { color: c.border, type: 'dashed' } } },
      series: [
        // same stack so income and -spending share one column, above and below zero
        { name: labels.income, type: 'bar', stack: 'flow', data: income, barMaxWidth: 64, itemStyle: { color: INCOME, borderRadius: 3 } },
        { name: labels.spending, type: 'bar', stack: 'flow', data: spending.map((v) => -v), barMaxWidth: 64, itemStyle: { color: SPENDING, borderRadius: 3 } },
        { name: labels.net, type: 'line', data: net, symbolSize: 6, itemStyle: { color: c.fg }, lineStyle: { color: c.fg, width: 2 } },
      ],
    })
  }, [x, income, spending, selected, labels, formatX, formatValue, c])

  return <div ref={el} className="h-full w-full cursor-pointer" />
}
