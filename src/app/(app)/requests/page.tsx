import WorkflowChatPanel from '@/components/WorkflowChatPanel'

export default function RequestsChatPage() {
  return (
    <div className="h-full" style={{ minHeight: '540px' }}>
      <WorkflowChatPanel chatType="planning" />
    </div>
  )
}
