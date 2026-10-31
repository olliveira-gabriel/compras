import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const brl = (n: any) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dt = (d: string) => d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
const ST: any = { consolidated: 'Consolidado', sent: 'Enviado', partially_received: 'Parcialmente recebido', received: 'Recebido', cancelled: 'Cancelado', open: 'Aberta' }
const Tag = ({ s }: any) => <span className={'tag ' + s}>{ST[s]}</span>
const run = async (p: any) => { const { error } = await p; if (error) { alert(error.message); return false } return true }
const csv = (rows: any[][], name: string) => {
  const t = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\n')
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + t], { type: 'text/csv' })); a.download = name; a.click()
}

function Login() {
  const [u, setU] = useState(''), [p, setP] = useState('')
  const go = async () => { const { error } = await sb.auth.signInWithPassword({ email: u.trim().toLowerCase() + '@app.local', password: p }); if (error) alert('Usuário ou senha inválidos') }
  return <div className="login"><h2>Controle de Compras</h2>
    <input placeholder="Usuário" value={u} onChange={e => setU(e.target.value)} />
    <input placeholder="Senha" type="password" value={p} onChange={e => setP(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
    <button className="pri" onClick={go}>Entrar</button></div>
}

function Dash() {
  const [k, setK] = useState<any>({}), [last, setLast] = useState<any[]>([])
  useEffect(() => { (async () => {
    const l = await sb.from('purchase_lists').select('id', { count: 'exact', head: true }).eq('status', 'open')
    const { data: o } = await sb.from('purchase_orders').select('*').order('created_at', { ascending: false })
    const { data: it } = await sb.from('purchase_order_items').select('quantity,received_quantity,purchase_orders!inner(status)').neq('purchase_orders.status', 'cancelled')
    const mes = today().slice(0, 7), os = o || [], m = os.filter(x => x.created_at.slice(0, 7) === mes && x.status !== 'cancelled')
    const c = (s: string) => os.filter(x => x.status === s).length
    setK({ listas: l.count || 0, mes: m.length, aguard: c('consolidated'), parc: c('partially_received'), rec: c('received'), valor: m.reduce((a, x) => a + +x.total_amount, 0), pend: (it || []).filter((x: any) => x.received_quantity < x.quantity).length })
    setLast(os.slice(0, 8))
  })() }, [])
  const K = (l: string, v: any) => <div className="card"><span>{l}</span><b>{v ?? 0}</b></div>
  return <div><h2>Dashboard</h2><div className="kpis">
    {K('Listas abertas', k.listas)}{K('Pedidos no mês', k.mes)}{K('Aguardando envio', k.aguard)}{K('Parcialmente recebidos', k.parc)}{K('Recebidos', k.rec)}{K('Compras no mês', brl(k.valor))}{K('Itens pendentes', k.pend)}</div>
    <h3>Últimos pedidos</h3><div className="tw"><table><thead><tr><th>Nº</th><th>Data</th><th>Fornecedor</th><th>Loja</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>{last.map(o => <tr key={o.id}><td>{o.number}</td><td>{dt(o.created_at)}</td><td>{o.supplier_name}</td><td>{o.store_name}</td><td>{brl(o.total_amount)}</td><td><Tag s={o.status} /></td></tr>)}</tbody></table></div></div>
}

function Crud({ table, title, fields }: any) {
  const [rows, setRows] = useState<any[]>([]), [f, setF] = useState<any>({}), [q, setQ] = useState(''), [sups, setSups] = useState<any[]>([])
  const load = useCallback(async () => { const { data } = await sb.from(table).select('*').order(fields[0].k); setRows(data || []) }, [table])
  useEffect(() => { load(); if (table === 'products') sb.from('suppliers').select('id,name').eq('active', true).order('name').then(r => setSups(r.data || [])) }, [load])
  const edit = async (r: any) => {
    const x = { ...r }
    if (table === 'products') { const { data } = await sb.from('product_suppliers').select('supplier_id').eq('product_id', r.id); x._sup = (data || []).map((d: any) => d.supplier_id) }
    setF(x)
  }
  const save = async () => {
    for (const fl of fields) if (fl.req && !String(f[fl.k] ?? '').trim()) return alert(fl.l + ' é obrigatório')
    const { id, created_at, updated_at, created_by, _sup, ...rest } = f
    for (const k in rest) if (rest[k] === '') rest[k] = null
    const res = id ? await sb.from(table).update(rest).eq('id', id).select().single() : await sb.from(table).insert(rest).select().single()
    if (res.error) return alert(res.error.message)
    if (table === 'products') {
      const pid = res.data.id
      if (!await run(sb.from('product_suppliers').delete().eq('product_id', pid))) return
      if ((_sup || []).length && !await run(sb.from('product_suppliers').insert(_sup.map((s: string) => ({ product_id: pid, supplier_id: s }))))) return
    }
    setF({}); load()
  }
  const vis = rows.filter(r => JSON.stringify(Object.values(r)).toLowerCase().includes(q.toLowerCase()))
  return <div><h2>{title}</h2>
    <div className="card"><div className="row">{fields.map((fl: any) => <input key={fl.k} placeholder={fl.l + (fl.req ? ' *' : '')} value={f[fl.k] ?? ''} onChange={e => setF({ ...f, [fl.k]: e.target.value })} />)}</div>
      {table === 'products' && <div className="row"><b>Fornecedores:</b>{sups.map(s => <label key={s.id}><input type="checkbox" checked={(f._sup || []).includes(s.id)} onChange={e => setF({ ...f, _sup: e.target.checked ? [...(f._sup || []), s.id] : (f._sup || []).filter((x: string) => x !== s.id) })} /> {s.name}</label>)}</div>}
      <button className="pri" onClick={save}>{f.id ? 'Salvar alterações' : 'Adicionar'}</button> {f.id && <button onClick={() => setF({})}>Cancelar</button>}</div>
    <div className="row"><input placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="tw"><table><thead><tr>{fields.map((fl: any) => <th key={fl.k}>{fl.l}</th>)}<th>Status</th><th></th></tr></thead>
      <tbody>{vis.map(r => <tr key={r.id}>{fields.map((fl: any) => <td key={fl.k}>{r[fl.k]}</td>)}<td>{r.active ? 'Ativo' : 'Inativo'}</td>
        <td><button onClick={() => edit(r)}>Editar</button> <button onClick={async () => { await run(sb.from(table).update({ active: !r.active }).eq('id', r.id)); load() }}>{r.active ? 'Inativar' : 'Ativar'}</button></td></tr>)}</tbody></table></div></div>
}

function Lists() {
  const [ls, setLs] = useState<any[]>([]), [name, setName] = useState(''), [cur, setCur] = useState<any>(null)
  const load = async () => { const { data } = await sb.from('purchase_lists').select('*').order('last_activity_at', { ascending: false }); setLs(data || []) }
  useEffect(() => { load() }, [])
  if (cur) return <Detail l={cur} back={() => { setCur(null); load() }} />
  return <div><h2>Listas de compras</h2>
    <div className="row"><input placeholder="Nome da nova lista" value={name} onChange={e => setName(e.target.value)} />
      <button className="pri" onClick={async () => { if (name.trim() && await run(sb.from('purchase_lists').insert({ name: name.trim() }))) { setName(''); load() } }}>Criar lista</button></div>
    <div className="tw"><table><thead><tr><th>Código</th><th>Nome</th><th>Criada em</th><th>Última movimentação</th><th>Status</th></tr></thead>
      <tbody>{ls.map(l => <tr key={l.id} className="c" onClick={() => setCur(l)}><td>{l.code}</td><td>{l.name}</td><td>{dt(l.created_at)}</td><td>{dt(l.last_activity_at)}</td><td><Tag s={l.status} /></td></tr>)}</tbody></table></div></div>
}

function Detail({ l, back }: any) {
  const blank = { entry_date: today(), product_id: '', supplier_id: '', store_id: '', quantity: '', unit_price: '', notes: '' }
  const [list, setList] = useState(l), [it, setIt] = useState<any[]>([]), [pr, setPr] = useState<any[]>([]), [ps, setPs] = useState<any[]>([]), [st, setSt] = useState<any[]>([])
  const [f, setF] = useState<any>(blank), [s, setS] = useState(''), [fs, setFs] = useState(''), [fst, setFst] = useState(''), [fp, setFp] = useState(''), [d1, setD1] = useState(''), [d2, setD2] = useState(''), [prev, setPrev] = useState(false)
  const open = list.status === 'open'
  const load = async () => {
    const a = await sb.from('purchase_list_items').select('*,products(sku,description),suppliers(name),stores(name)').eq('list_id', l.id).order('entry_date').order('created_at')
    setIt(a.data || [])
    const { data } = await sb.from('purchase_lists').select('*').eq('id', l.id).single(); if (data) setList(data)
  }
  useEffect(() => {
    load()
    sb.from('products').select('id,sku,description').eq('active', true).order('description').then(r => setPr(r.data || []))
    sb.from('product_suppliers').select('product_id,suppliers(id,name,active)').then(r => setPs(r.data || []))
    sb.from('stores').select('id,name').eq('active', true).order('name').then(r => setSt(r.data || []))
  }, [])
  const sups = ps.filter(x => x.product_id === f.product_id && x.suppliers?.active).map(x => x.suppliers)
  const prods = pr.filter(p => (p.sku + ' ' + p.description).toLowerCase().includes(s.toLowerCase()))
  const save = async () => {
    const { entry_date, product_id, supplier_id, store_id, quantity, unit_price, notes } = f
    if (!entry_date || !product_id || !supplier_id || !store_id || !(+quantity > 0) || unit_price === '' || +unit_price < 0) return alert('Preencha todos os campos obrigatórios')
    const row = { entry_date, product_id, supplier_id, store_id, quantity: Math.floor(+quantity), unit_price: +unit_price, notes: notes || null }
    if (await run(f.id ? sb.from('purchase_list_items').update(row).eq('id', f.id) : sb.from('purchase_list_items').insert({ ...row, list_id: l.id }))) { setF({ ...blank, store_id, entry_date }); load() }
  }
  const vis = it.filter(x => (!fs || x.supplier_id === fs) && (!fst || x.store_id === fst) && (x.products.sku + x.products.description).toLowerCase().includes(fp.toLowerCase()) && (!d1 || x.entry_date >= d1) && (!d2 || x.entry_date <= d2))
  const groups: any = {}
  it.forEach(x => { const k = [x.supplier_id, x.store_id, x.product_id, x.unit_price].join('|'); const g = groups[k] ||= { sup: x.suppliers.name, store: x.stores.name, p: x.products.description, price: x.unit_price, q: 0 }; g.q += x.quantity })
  const G = Object.values(groups).sort((a: any, b: any) => (a.sup + a.store).localeCompare(b.sup + b.store)) as any[]
  const consolidate = async () => {
    if (!confirm('Confirmar consolidação? A lista não poderá mais ser editada.')) return
    const { data, error } = await sb.rpc('consolidate_purchase_list', { p_list_id: l.id })
    if (error) return alert(error.message)
    alert(data + ' pedido(s) gerado(s).'); setPrev(false); load()
  }
  return <div><div className="row"><button onClick={back}>← Voltar</button><h2 style={{ margin: 0 }}>{list.code} · {list.name}</h2><Tag s={list.status} /></div>
    {open && <div className="card"><div className="row">
      <input type="date" value={f.entry_date} onChange={e => setF({ ...f, entry_date: e.target.value })} />
      <input placeholder="Buscar produto (código/descrição)" value={s} onChange={e => setS(e.target.value)} />
      <select value={f.product_id} onChange={e => setF({ ...f, product_id: e.target.value, supplier_id: '' })}><option value="">Produto *</option>{prods.slice(0, 200).map(p => <option key={p.id} value={p.id}>{p.sku} - {p.description}</option>)}</select>
      <select value={f.supplier_id} onChange={e => setF({ ...f, supplier_id: e.target.value })}><option value="">Fornecedor *</option>{sups.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <select value={f.store_id} onChange={e => setF({ ...f, store_id: e.target.value })}><option value="">Loja *</option>{st.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
      <input type="number" min="1" placeholder="Qtd *" style={{ width: 80 }} value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} />
      <input type="number" min="0" step="0.01" placeholder="Preço unit. *" style={{ width: 110 }} value={f.unit_price} onChange={e => setF({ ...f, unit_price: e.target.value })} />
      <input placeholder="Observação" value={f.notes ?? ''} onChange={e => setF({ ...f, notes: e.target.value })} />
      <button className="pri" onClick={save}>{f.id ? 'Salvar' : 'Adicionar'}</button>{f.id && <button onClick={() => setF(blank)}>Cancelar</button>}</div></div>}
    <div className="row"><input placeholder="Filtrar produto" value={fp} onChange={e => setFp(e.target.value)} />
      <select value={fs} onChange={e => setFs(e.target.value)}><option value="">Todos fornecedores</option>{[...new Map(it.map(x => [x.supplier_id, x.suppliers.name]))].map(([id, n]: any) => <option key={id} value={id}>{n}</option>)}</select>
      <select value={fst} onChange={e => setFst(e.target.value)}><option value="">Todas lojas</option>{[...new Map(it.map(x => [x.store_id, x.stores.name]))].map(([id, n]: any) => <option key={id} value={id}>{n}</option>)}</select>
      <input type="date" value={d1} onChange={e => setD1(e.target.value)} /><input type="date" value={d2} onChange={e => setD2(e.target.value)} />
      <b>Qtd: {vis.reduce((a, x) => a + x.quantity, 0)} · Total: {brl(vis.reduce((a, x) => a + +x.total, 0))}</b>
      {open && <button className="pri" disabled={!it.length} onClick={() => setPrev(true)}>Consolidar lista</button>}</div>
    {prev && <div className="card"><h3>Prévia da consolidação</h3><div className="tw"><table><thead><tr><th>Fornecedor</th><th>Loja</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
      <tbody>{G.map((g, i) => <tr key={i}><td>{g.sup}</td><td>{g.store}</td><td>{g.p}</td><td>{g.q}</td><td>{brl(g.price)}</td><td>{brl(g.q * g.price)}</td></tr>)}</tbody></table></div>
      <p><b>{new Set(G.map(g => g.sup + g.store)).size} pedido(s) · {brl(G.reduce((a, g) => a + g.q * g.price, 0))}</b></p>
      <button className="pri" onClick={consolidate}>Confirmar</button> <button onClick={() => setPrev(false)}>Revisar</button></div>}
    <div className="tw"><table><thead><tr><th>Data</th><th>Produto</th><th>Fornecedor</th><th>Loja</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Obs.</th><th></th></tr></thead>
      <tbody>{vis.map(x => <tr key={x.id}><td>{dt(x.entry_date)}</td><td>{x.products.sku} - {x.products.description}</td><td>{x.suppliers.name}</td><td>{x.stores.name}</td><td>{x.quantity}</td><td>{brl(x.unit_price)}</td><td>{brl(x.total)}</td><td>{x.notes}</td>
        <td>{open && <><button onClick={() => { setF({ ...x }); window.scrollTo(0, 0) }}>Editar</button> <button className="dan" onClick={async () => { if (confirm('Excluir lançamento?')) { await run(sb.from('purchase_list_items').delete().eq('id', x.id)); load() } }}>Excluir</button></>}</td></tr>)}</tbody></table></div></div>
}

function Orders({ admin }: any) {
  const [os, setOs] = useState<any[]>([]), [fs, setFs] = useState(''), [ft, setFt] = useState(''), [from, setFrom] = useState(''), [to, setTo] = useState(''), [sel, setSel] = useState<any>(null)
  const load = async () => {
    let q = sb.from('purchase_orders').select('*').order('created_at', { ascending: false })
    if (fs) q = q.eq('status', fs); if (from) q = q.gte('created_at', from + 'T00:00:00-03:00'); if (to) q = q.lte('created_at', to + 'T23:59:59-03:00')
    const { data } = await q; setOs(data || [])
  }
  useEffect(() => { load() }, [fs, from, to])
  if (sel) return <OrderDetail o={sel} admin={admin} back={() => { setSel(null); load() }} />
  const vis = os.filter(o => (o.supplier_name + o.store_name + o.number).toLowerCase().includes(ft.toLowerCase()))
  return <div><h2>Pedidos</h2><div className="row">
    <input placeholder="Fornecedor, loja ou nº" value={ft} onChange={e => setFt(e.target.value)} />
    <select value={fs} onChange={e => setFs(e.target.value)}><option value="">Todos status</option>{Object.keys(ST).filter(k => k !== 'open').map(k => <option key={k} value={k}>{ST[k]}</option>)}</select>
    <input type="date" value={from} onChange={e => setFrom(e.target.value)} /><input type="date" value={to} onChange={e => setTo(e.target.value)} />
    <button onClick={() => csv([['Número', 'Data', 'Fornecedor', 'Loja', 'Status', 'Total'], ...vis.map(o => [o.number, dt(o.created_at), o.supplier_name, o.store_name, ST[o.status], o.total_amount])], 'pedidos.csv')}>Exportar CSV</button></div>
    <div className="tw"><table><thead><tr><th>Nº</th><th>Data</th><th>Fornecedor</th><th>Loja</th><th>Total</th><th>Status</th></tr></thead>
      <tbody>{vis.map(o => <tr key={o.id} className="c" onClick={() => setSel(o)}><td>{o.number}</td><td>{dt(o.created_at)}</td><td>{o.supplier_name}</td><td>{o.store_name}</td><td>{brl(o.total_amount)}</td><td><Tag s={o.status} /></td></tr>)}</tbody></table></div></div>
}

function OrderDetail({ o, admin, back }: any) {
  const [ord, setOrd] = useState(o), [it, setIt] = useState<any[]>([]), [rc, setRc] = useState<any[]>([]), [qty, setQty] = useState<any>({}), [notes, setNotes] = useState(''), [over, setOver] = useState(false)
  const load = async () => {
    const a = await sb.from('purchase_order_items').select('*').eq('order_id', o.id).order('description'); setIt(a.data || [])
    const b = await sb.from('purchase_orders').select('*').eq('id', o.id).single(); if (b.data) setOrd(b.data)
    const c = await sb.from('receipts').select('*,receipt_items(quantity,purchase_order_items(description)),profiles:created_by(name)').eq('order_id', o.id).order('created_at', { ascending: false }); setRc(c.data || [])
  }
  useEffect(() => { load() }, [])
  const canRec = ['consolidated', 'sent', 'partially_received'].includes(ord.status)
  const receive = async () => {
    const items = Object.entries(qty).filter(([, v]) => +(v as any) > 0).map(([id, v]) => ({ order_item_id: id, quantity: +(v as any) }))
    if (!items.length) return alert('Informe ao menos uma quantidade')
    if (await run(sb.rpc('register_receipt', { p_order_id: o.id, p_items: items, p_notes: notes || null, p_allow_over: over }))) { setQty({}); setNotes(''); load() }
  }
  const act = async (fn: string, args: any) => { if (await run(sb.rpc(fn, args))) load() }
  return <div><div className="row"><button onClick={back}>← Voltar</button><h2 style={{ margin: 0 }}>Pedido {ord.number}</h2><Tag s={ord.status} /></div>
    <div className="card"><p>Fornecedor: <b>{ord.supplier_name}</b> · Loja: <b>{ord.store_name}</b> · Criado em {dt(ord.created_at)} · Total: <b>{brl(ord.total_amount)}</b>{ord.sent_at && <> · Enviado em {dt(ord.sent_at)}</>}{ord.cancel_reason && <> · Motivo do cancelamento: {ord.cancel_reason}</>}</p>
      <div className="row">
        {ord.status === 'consolidated' && <button className="pri" onClick={() => act('mark_order_sent', { p_order_id: o.id })}>Registrar envio</button>}
        {admin && ['consolidated', 'sent'].includes(ord.status) && <button className="dan" onClick={() => { const r = prompt('Motivo do cancelamento:'); if (r) act('cancel_purchase_order', { p_order_id: o.id, p_reason: r }) }}>Cancelar pedido</button>}
        <button onClick={() => csv([['SKU', 'Descrição', 'Solicitada', 'Recebida', 'Pendente', 'Preço', 'Total'], ...it.map(i => [i.sku, i.description, i.quantity, i.received_quantity, i.quantity - i.received_quantity, i.unit_price, i.total])], ord.number + '.csv')}>Exportar CSV</button>
        <button onClick={() => window.print()}>Imprimir</button></div></div>
    <div className="tw"><table><thead><tr><th>SKU</th><th>Produto</th><th>Solicitada</th><th>Recebida</th><th>Pendente</th><th>Preço</th><th>Total</th>{canRec && <th>Receber agora</th>}</tr></thead>
      <tbody>{it.map(i => <tr key={i.id}><td>{i.sku}</td><td>{i.description}</td><td>{i.quantity}</td><td>{i.received_quantity}</td><td>{Math.max(0, i.quantity - i.received_quantity)}</td><td>{brl(i.unit_price)}</td><td>{brl(i.total)}</td>
        {canRec && <td><input type="number" min="0" style={{ width: 80 }} value={qty[i.id] ?? ''} onChange={e => setQty({ ...qty, [i.id]: e.target.value })} /></td>}</tr>)}</tbody></table></div>
    {canRec && <div className="row" style={{ marginTop: 12 }}><input placeholder="Observações do recebimento" value={notes} onChange={e => setNotes(e.target.value)} />
      {admin && <label><input type="checkbox" checked={over} onChange={e => setOver(e.target.checked)} /> Permitir acima do pendente</label>}
      <button className="pri" onClick={receive}>Registrar recebimento</button></div>}
    <h3>Histórico de recebimentos</h3>{rc.length === 0 && <p>Nenhum recebimento.</p>}
    {rc.map(r => <div className="card" key={r.id}><b>{dt(r.received_at)}</b> · {r.profiles?.name} {r.notes && <>· {r.notes}</>}<br />{r.receipt_items.map((x: any, i: number) => <span key={i}>{x.purchase_order_items?.description}: {x.quantity}{i < r.receipt_items.length - 1 ? ' | ' : ''}</span>)}</div>)}</div>
}

export default function App() {
  const [session, setSession] = useState<any>(null), [prof, setProf] = useState<any>(null), [ready, setReady] = useState(false), [tab, setTab] = useState('dash')
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true) })
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s)); return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => { if (session) sb.from('profiles').select('*').eq('id', session.user.id).single().then(({ data }) => setProf(data)); else setProf(null) }, [session])
  if (!ready) return null
  if (!session) return <Login />
  if (!prof) return <div className="login">Carregando perfil... <button onClick={() => sb.auth.signOut()}>Sair</button></div>
  if (!prof.active) return <div className="login">Usuário inativo. <button onClick={() => sb.auth.signOut()}>Sair</button></div>
  const admin = prof.role === 'admin'
  const tabs: any = { dash: 'Dashboard', lists: 'Listas de compras', orders: 'Pedidos', products: 'Produtos', suppliers: 'Fornecedores', stores: 'Lojas' }
  const F = {
    products: [{ k: 'sku', l: 'Código/SKU', req: 1 }, { k: 'description', l: 'Descrição', req: 1 }, { k: 'category', l: 'Categoria' }],
    suppliers: [{ k: 'name', l: 'Nome/Razão social', req: 1 }, { k: 'cnpj', l: 'CNPJ' }, { k: 'contact', l: 'Contato' }, { k: 'phone', l: 'Telefone/WhatsApp' }, { k: 'email', l: 'E-mail' }, { k: 'notes', l: 'Observações' }],
    stores: [{ k: 'name', l: 'Nome', req: 1 }, { k: 'address', l: 'Endereço' }, { k: 'contact', l: 'Contato' }]
  }
  return <div className="app"><nav><b>Controle de Compras</b>
    {Object.keys(tabs).map(k => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{tabs[k]}</button>)}
    <span style={{ flex: 1 }} />
    <small style={{ padding: '0 10px' }}>{prof.name} ({admin ? 'Admin' : 'Operador'})</small>
    <button onClick={async () => { const p = prompt('Nova senha (mín. 6 caracteres):'); if (p) { if (await run(sb.auth.updateUser({ password: p }))) alert('Senha alterada.') } }}>Alterar senha</button>
    <button onClick={() => sb.auth.signOut()}>Sair</button></nav>
    <main>{tab === 'dash' && <Dash />}{tab === 'lists' && <Lists />}{tab === 'orders' && <Orders admin={admin} />}
      {tab === 'products' && <Crud key="p" table="products" title="Produtos" fields={F.products} />}
      {tab === 'suppliers' && <Crud key="s" table="suppliers" title="Fornecedores" fields={F.suppliers} />}
      {tab === 'stores' && <Crud key="l" table="stores" title="Lojas" fields={F.stores} />}</main></div>
}
