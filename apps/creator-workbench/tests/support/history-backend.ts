// HTTP fixtures use the backend envelope, independently of the service DTO.
export function historyListResponse(items: readonly {
  id: string;
  title: string;
  status?: string;
  updatedAt?: string;
}[]) {
  return {
    returnCode: 'SUC0000', errorMsg: null,
    body: {
      total_conversations: items.length,
      conversations: items.map(item => ({
        thread_id: item.id, title: item.title,
        ...(item.status === undefined ? {} : { status: item.status }),
        ...(item.updatedAt === undefined ? {} : { last_message_time: item.updatedAt }),
      })),
    },
  };
}

export function historyDetailResponse(detail: {
  id: string | undefined;
  title: string | undefined;
  history: { format?: string; messages: readonly unknown[] };
}) {
  return {
    returnCode: 'SUC0000', errorMsg: null,
    body: {
      thread_id: detail.id, title: detail.title,
      max_message_checkpoint: { values: { messages: detail.history.messages } },
    },
  };
}
