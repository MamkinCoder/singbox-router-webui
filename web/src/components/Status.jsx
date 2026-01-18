export default function Status({ status }) {
  const cls = status?.ok === true ? 'status ok' : status?.ok === false ? 'status bad' : 'status'
  return <div className={cls}>{status?.msg ?? '…'}</div>
}
