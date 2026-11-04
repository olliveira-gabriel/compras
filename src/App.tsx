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
  const [importRows, setImportRows] = useState<any[]>([]), [importName, setImportName] = useState(''), [importing, setImporting] = useState(false)
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
  const norm = (value: any) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
  const pickColumn = (row: any, aliases: string[]) => {
    const keys = Object.keys(row)
    const key = keys.find(k => aliases.includes(norm(k))) || keys.find(k => aliases.some(a => norm(k).startsWith(a)))
    return key ? String(row[key] ?? '').trim() : ''
  }
  const loadImportFile = async (file?: File) => {
    if (!file) return
    try {
      const { read, utils } = await import('xlsx')
      const workbook = read(await file.arrayBuffer(), { type: 'array' })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      if (!sheet) throw new Error('Não encontrei uma aba com dados no arquivo.')
      const source = utils.sheet_to_json<any>(sheet, { defval: '', raw: false })
      if (!source.length) throw new Error('O arquivo não tem linhas de produtos abaixo do cabeçalho.')
      const existing = new Set(rows.map(r => norm(r.sku)))
      const seen = new Set<string>()
      const parsed = source.map((row, index) => {
        const sku = pickColumn(row, ['sku', 'codigo', 'codigosku', 'codigoproduto', 'referencia'])
        const description = pickColumn(row, ['descricao', 'produto', 'nome', 'nomeproduto'])
        const category = pickColumn(row, ['categoria', 'category', 'familia', 'grupo'])
        const supplierText = pickColumn(row, ['fornecedor', 'fornecedores', 'supplier', 'suppliers'])
        const issues: string[] = []
        if (!sku) issues.push('Código/SKU vazio')
        if (!description) issues.push('Descrição vazia')
        const normalizedSku = norm(sku)
        if (normalizedSku && existing.has(normalizedSku)) issues.push('Código já cadastrado')
        if (normalizedSku && seen.has(normalizedSku)) issues.push('Código repetido no arquivo')
        if (normalizedSku) seen.add(normalizedSku)
        const supplierNames = supplierText ? supplierText.split(/[;|]/).map((x: string) => x.trim()).filter(Boolean) : []
        const supplierIds: string[] = []
        supplierNames.forEach((supplierName: string) => {
          const supplier = sups.find(x => norm(x.name) === norm(supplierName))
          if (supplier) supplierIds.push(supplier.id)
          else issues.push(`Fornecedor não encontrado: ${supplierName}`)
        })
        return { rowNumber: index + 2, sku, description, category, supplierIds: [...new Set(supplierIds)], issues }
      })
      setImportName(file.name)
      setImportRows(parsed)
    } catch (error: any) { alert(error.message || 'Não foi possível ler esse arquivo.') }
  }
  const importProducts = async () => {
    const valid = importRows.filter(r => !r.issues.length)
    if (!valid.length || importing) return
    setImporting(true)
    const result = await sb.from('products').insert(valid.map(({ sku, description, category }) => ({ sku, description, category: category || null }))).select('id,sku')
    if (result.error) { alert(result.error.message); setImporting(false); return }
    const skuToId = new Map((result.data || []).map((p: any) => [norm(p.sku), p.id]))
    const links = valid.flatMap(r => r.supplierIds.map((supplier_id: string) => ({ product_id: skuToId.get(norm(r.sku)), supplier_id })))
    let supplierError = ''
    if (links.length) {
      const { error } = await sb.from('product_suppliers').insert(links)
      if (error) supplierError = error.message
    }
    alert(`${result.data?.length || 0} produto(s) importado(s).${supplierError ? ` Os vínculos com fornecedores não foram salvos: ${supplierError}` : ''}`)
    setImportRows([]); setImportName(''); setImporting(false); load()
  }
  const downloadTemplate = () => {
    const content = '\ufeffCódigo/SKU;Descrição;Categoria;Fornecedores\r\n001;Café em pó 500 g;Mercearia;\r\n'
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = 'modelo-produtos.csv'; a.click(); URL.revokeObjectURL(url)
  }
  const vis = rows.filter(r => JSON.stringify(Object.values(r)).toLowerCase().includes(q.toLowerCase()))
  return <div><div className="products-heading"><h2>{title}</h2>{table === 'products' && <div className="import-actions"><label className="import-file-button">Importar Excel ou CSV<input type="file" accept=".xlsx,.xls,.csv" onChange={e => { loadImportFile(e.target.files?.[0]); e.currentTarget.value = '' }} /></label><button type="button" onClick={downloadTemplate}>Baixar modelo CSV</button></div>}</div>
    {table === 'products' && <p className="import-hint">Colunas aceitas: Código/SKU e Descrição (obrigatórias), Categoria e Fornecedores (opcionais). Use nomes de fornecedores já cadastrados; separe vários com ; ou |.</p>}
    {table === 'products' && importRows.length > 0 && <section className="card import-preview"><div className="import-preview-heading"><div><h3>Prévia da importação</h3><p>{importName} · {importRows.filter(r => !r.issues.length).length} pronto(s) para importar · {importRows.filter(r => r.issues.length).length} com problema</p></div><button type="button" onClick={() => { setImportRows([]); setImportName('') }}>Cancelar</button></div><div className="tw"><table><thead><tr><th>Linha</th><th>Código/SKU</th><th>Descrição</th><th>Categoria</th><th>Fornecedores</th><th>Validação</th></tr></thead><tbody>{importRows.slice(0, 12).map(r => <tr key={r.rowNumber}><td>{r.rowNumber}</td><td>{r.sku || '—'}</td><td>{r.description || '—'}</td><td>{r.category || '—'}</td><td>{r.supplierIds.length || '—'}</td><td className={r.issues.length ? 'import-error' : 'import-valid'}>{r.issues.join('; ') || 'Pronto'}</td></tr>)}</tbody></table></div>{importRows.length > 12 && <p className="import-more">Mostrando 12 de {importRows.length} linhas.</p>}<div className="import-preview-footer"><span>Linhas com erro serão ignoradas. Códigos já cadastrados não serão alterados.</span><button className="pri" type="button" disabled={importing || !importRows.some(r => !r.issues.length)} onClick={importProducts}>{importing ? 'Importando…' : `Importar ${importRows.filter(r => !r.issues.length).length} produto(s)`}</button></div></section>}
    <div className="card"><div className="row">{fields.map((fl: any) => <input key={fl.k} placeholder={fl.l + (fl.req ? ' *' : '')} value={f[fl.k] ?? ''} onChange={e => setF({ ...f, [fl.k]: e.target.value })} />)}</div>
      {table === 'products' && <div className="row"><b>Fornecedores:</b>{sups.map(s => <label key={s.id}><input type="checkbox" checked={(f._sup || []).includes(s.id)} onChange={e => setF({ ...f, _sup: e.target.checked ? [...(f._sup || []), s.id] : (f._sup || []).filter((x: string) => x !== s.id) })} /> {s.name}</label>)}</div>}
      <button className="pri" onClick={save}>{f.id ? 'Salvar alterações' : 'Adicionar'}</button> {f.id && <button onClick={() => setF({})}>Cancelar</button>}</div>
    <div className="row"><input placeholder="Pesquisar..." value={q} onChange={e => setQ(e.target.value)} /></div>
    <div className="tw"><table><thead><tr>{fields.map((fl: any) => <th key={fl.k}>{fl.l}</th>)}<th>Status</th><th></th></tr></thead>
      <tbody>{vis.map(r => <tr key={r.id}>{fields.map((fl: any) => <td key={fl.k}>{r[fl.k]}</td>)}<td>{r.active ? 'Ativo' : 'Inativo'}</td>
        <td><button onClick={() => edit(r)}>Editar</button> <button onClick={async () => { await run(sb.from(table).update({ active: !r.active }).eq('id', r.id)); load() }}>{r.active ? 'Inativar' : 'Ativar'}</button></td></tr>)}</tbody></table></div></div>
}

function Lists() {
  const [ls, setLs] = useState<any[]>([]), [name, setName] = useState(''), [cur, setCur] = useState<any>(null), [saving, setSaving] = useState(false)
  const load = async () => { const { data } = await sb.from('purchase_lists').select('*').order('last_activity_at', { ascending: false }); setLs(data || []) }
  useEffect(() => { load() }, [])
  if (cur) return <Detail l={cur} back={() => { setCur(null); load() }} />
  const create = async (e: any) => {
    e.preventDefault()
    const value = name.trim()
    if (!value || saving) return
    setSaving(true)
    if (await run(sb.from('purchase_lists').insert({ name: value }))) { setName(''); await load() }
    setSaving(false)
  }
  return <section className="lists-page">
    <header className="lists-heading"><div><span className="eyebrow">COMPRAS</span><h2>Listas de compras</h2><p>Organize os itens que precisam ser comprados e acompanhe cada lista até virar pedido.</p></div><span className="lists-count">{ls.length} {ls.length === 1 ? 'lista' : 'listas'}</span></header>
    <form className="create-list card" onSubmit={create}>
      <div className="create-list-copy"><span className="create-list-icon">＋</span><div><h3>Comece uma nova lista</h3><p>Dê um nome fácil de reconhecer, como “Reposição da loja Centro”.</p></div></div>
      <label className="create-list-field" htmlFor="new-list-name">Nome da lista</label>
      <div className="create-list-controls"><input id="new-list-name" autoComplete="off" placeholder="Ex.: Compras da semana" value={name} onChange={e => setName(e.target.value)} />
        <button className="pri" type="submit" disabled={!name.trim() || saving}>{saving ? 'Criando…' : 'Criar lista'}</button></div>
    </form>
    <div className="lists-section-heading"><div><h3>Suas listas</h3><p>Selecione uma lista para adicionar produtos ou acompanhar o andamento.</p></div></div>
    {ls.length ? <div className="list-cards">{ls.map(l => <button type="button" className="list-card" key={l.id} onClick={() => setCur(l)}>
      <span className="list-card-top"><span className="list-code">Lista #{l.code}</span><Tag s={l.status} /></span>
      <strong className="list-card-name">{l.name}</strong>
      <span className="list-card-date">Atualizada em {dt(l.last_activity_at || l.created_at)}</span>
      <span className="list-card-open">Abrir lista <span aria-hidden="true">→</span></span>
    </button>)}</div> : <div className="lists-empty card"><span className="empty-icon">☷</span><h3>Nenhuma lista por aqui ainda</h3><p>Crie sua primeira lista acima para começar a organizar uma compra.</p></div>}
  </section>
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
  return <div className="list-detail"><div className="detail-heading"><button onClick={back}>← Voltar às listas</button><div><span className="eyebrow">LISTA DE COMPRAS</span><h2>{list.code} · {list.name}</h2></div><Tag s={list.status} /></div>
    {open && <section className="card entry-panel"><div className="entry-panel-heading"><div><h3>{f.id ? 'Editar item' : 'Adicionar itens à lista'}</h3><p>Preencha os dados do produto. Os campos com * são obrigatórios.</p></div></div>
      <div className="entry-grid">
        <label className="entry-field"><span>Data da compra *</span><input type="date" value={f.entry_date} onChange={e => setF({ ...f, entry_date: e.target.value })} /></label>
        <label className="entry-field entry-product-search"><span>Buscar produto</span><input placeholder="Digite o código ou nome" value={s} onChange={e => setS(e.target.value)} /></label>
        <label className="entry-field entry-product-select"><span>Produto *</span><select value={f.product_id} onChange={e => setF({ ...f, product_id: e.target.value, supplier_id: '' })}><option value="">Selecione um produto</option>{prods.slice(0, 200).map(p => <option key={p.id} value={p.id}>{p.sku} - {p.description}</option>)}</select></label>
        <label className="entry-field"><span>Fornecedor *</span><select value={f.supplier_id} onChange={e => setF({ ...f, supplier_id: e.target.value })}><option value="">Selecione um fornecedor</option>{sups.map((x: any) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="entry-field"><span>Loja *</span><select value={f.store_id} onChange={e => setF({ ...f, store_id: e.target.value })}><option value="">Selecione uma loja</option>{st.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="entry-field"><span>Quantidade *</span><input type="number" min="1" placeholder="Ex.: 10" value={f.quantity} onChange={e => setF({ ...f, quantity: e.target.value })} /></label>
        <label className="entry-field"><span>Preço unitário *</span><input type="number" min="0" step="0.01" placeholder="0,00" value={f.unit_price} onChange={e => setF({ ...f, unit_price: e.target.value })} /></label>
        <label className="entry-field entry-notes"><span>Observação <small>Opcional</small></span><input placeholder="Detalhes úteis sobre este item" value={f.notes ?? ''} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
      </div>
      <div className="entry-actions">{f.id && <button type="button" onClick={() => setF({ ...blank, store_id: f.store_id, entry_date: f.entry_date })}>Cancelar edição</button>}<button className="pri" onClick={save}>{f.id ? 'Salvar alterações' : 'Adicionar item'}</button></div>
    </section>}
    <section className="items-section"><div className="items-section-heading"><div><h3>Itens da lista</h3><p>Pesquise e filtre os itens registrados nesta lista.</p></div><div className="items-total"><span>{vis.reduce((a, x) => a + x.quantity, 0)} unidades</span><strong>{brl(vis.reduce((a, x) => a + +x.total, 0))}</strong></div></div>
    <div className="item-filters"><label><span>Produto</span><input placeholder="Buscar na lista" value={fp} onChange={e => setFp(e.target.value)} /></label>
      <select value={fs} onChange={e => setFs(e.target.value)}><option value="">Todos fornecedores</option>{[...new Map(it.map(x => [x.supplier_id, x.suppliers.name]))].map(([id, n]: any) => <option key={id} value={id}>{n}</option>)}</select>
      <select value={fst} onChange={e => setFst(e.target.value)}><option value="">Todas lojas</option>{[...new Map(it.map(x => [x.store_id, x.stores.name]))].map(([id, n]: any) => <option key={id} value={id}>{n}</option>)}</select>
      <label><span>De</span><input aria-label="Data inicial" type="date" value={d1} onChange={e => setD1(e.target.value)} /></label><label><span>Até</span><input aria-label="Data final" type="date" value={d2} onChange={e => setD2(e.target.value)} /></label>
      {open && <button className="pri consolidate-button" disabled={!it.length} onClick={() => setPrev(true)}>Consolidar lista</button>}</div></section>
    {prev && <div className="card"><h3>Prévia da consolidação</h3><div className="tw"><table><thead><tr><th>Fornecedor</th><th>Loja</th><th>Produto</th><th>Qtd</th><th>Preço</th><th>Total</th></tr></thead>
      <tbody>{G.map((g, i) => <tr key={i}><td>{g.sup}</td><td>{g.store}</td><td>{g.p}</td><td>{g.q}</td><td>{brl(g.price)}</td><td>{brl(g.q * g.price)}</td></tr>)}</tbody></table></div>
      <p><b>{new Set(G.map(g => g.sup + g.store)).size} pedido(s) · {brl(G.reduce((a, g) => a + g.q * g.price, 0))}</b></p>
      <button className="pri" onClick={consolidate}>Confirmar</button> <button onClick={() => setPrev(false)}>Revisar</button></div>}
    {vis.length ? <div className="tw item-table"><table><thead><tr><th>Data</th><th>Produto</th><th>Fornecedor</th><th>Loja</th><th>Qtd</th><th>Preço</th><th>Total</th><th>Obs.</th><th></th></tr></thead>
      <tbody>{vis.map(x => <tr key={x.id}><td>{dt(x.entry_date)}</td><td>{x.products.sku} - {x.products.description}</td><td>{x.suppliers.name}</td><td>{x.stores.name}</td><td>{x.quantity}</td><td>{brl(x.unit_price)}</td><td>{brl(x.total)}</td><td>{x.notes}</td>
        <td>{open && <><button onClick={() => { setF({ ...x }); window.scrollTo(0, 0) }}>Editar</button> <button className="dan" onClick={async () => { if (confirm('Excluir lançamento?')) { await run(sb.from('purchase_list_items').delete().eq('id', x.id)); load() } }}>Excluir</button></>}</td></tr>)}</tbody></table></div> : <div className="items-empty"><span aria-hidden="true">＋</span><h3>{it.length ? 'Nenhum item encontrado' : 'Sua lista ainda está vazia'}</h3><p>{it.length ? 'Ajuste os filtros ou a busca para ver os itens.' : open ? 'Use o formulário acima para adicionar o primeiro produto.' : 'Esta lista foi consolidada sem itens visíveis.'}</p></div>}
    </div>
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
