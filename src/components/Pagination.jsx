import { ChevronLeft, ChevronRight } from 'lucide-react'

export default function Pagination({ page, total, perPage, onChange }) {
  const pages = Math.ceil(total / perPage)
  if (pages <= 1) return null

  const from = (page - 1) * perPage + 1
  const to   = Math.min(page * perPage, total)

  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:'1.25rem', flexWrap:'wrap', gap:'8px' }}>
      <span style={{ fontSize:'0.78rem', color:'#475569' }}>
        Mostrando <strong style={{color:'#94a3b8'}}>{from}–{to}</strong> de <strong style={{color:'#94a3b8'}}>{total}</strong>
      </span>
      <div style={{ display:'flex', alignItems:'center', gap:'4px' }}>
        <button onClick={() => onChange(1)} disabled={page === 1}
          style={{ padding:'4px 8px', borderRadius:'8px', fontSize:'0.75rem', color: page===1?'#1e293b':'#64748b', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', cursor: page===1?'not-allowed':'pointer' }}>
          «
        </button>
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          style={{ padding:'4px 8px', borderRadius:'8px', color: page===1?'#1e293b':'#64748b', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', cursor: page===1?'not-allowed':'pointer', display:'flex', alignItems:'center' }}>
          <ChevronLeft size={14}/>
        </button>

        {Array.from({ length: pages }, (_, i) => i + 1)
          .filter(p => p === 1 || p === pages || Math.abs(p - page) <= 1)
          .reduce((acc, p, idx, arr) => {
            if (idx > 0 && p - arr[idx-1] > 1) acc.push('...')
            acc.push(p)
            return acc
          }, [])
          .map((p, i) => p === '...' ? (
            <span key={`e${i}`} style={{ padding:'4px 6px', color:'#334155', fontSize:'0.75rem' }}>…</span>
          ) : (
            <button key={p} onClick={() => onChange(p)}
              style={{ padding:'4px 10px', borderRadius:'8px', fontSize:'0.78rem', fontWeight: p===page?'700':'400',
                color: p===page?'#4ade80':'#64748b',
                background: p===page?'rgba(34,197,94,0.12)':'rgba(255,255,255,0.04)',
                border: p===page?'1px solid rgba(34,197,94,0.3)':'1px solid rgba(255,255,255,0.06)',
                cursor:'pointer' }}>
              {p}
            </button>
          ))
        }

        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          style={{ padding:'4px 8px', borderRadius:'8px', color: page===pages?'#1e293b':'#64748b', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', cursor: page===pages?'not-allowed':'pointer', display:'flex', alignItems:'center' }}>
          <ChevronRight size={14}/>
        </button>
        <button onClick={() => onChange(pages)} disabled={page === pages}
          style={{ padding:'4px 8px', borderRadius:'8px', fontSize:'0.75rem', color: page===pages?'#1e293b':'#64748b', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)', cursor: page===pages?'not-allowed':'pointer' }}>
          »
        </button>
      </div>
    </div>
  )
}
