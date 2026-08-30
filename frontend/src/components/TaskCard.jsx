const PRIORITY_LABEL = { low: 'Low', medium: 'Medium', high: 'High' };

export default function TaskCard({ task, onOpen, onDragStart }) {
  return (
    <div
      className="task-card"
      draggable
      onDragStart={(e) => onDragStart(e, task)}
      onClick={() => onOpen(task)}
    >
      <div className={`priority-tag priority-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</div>
      <div className="task-title">{task.title}</div>
      {task.due_date && <div className="task-due">Due {task.due_date}</div>}
      <div className="task-footer">
        {task.assignee_name ? (
          <div className="mini-avatar" style={{ background: task.assignee_color }} title={task.assignee_name}>
            {task.assignee_name[0]?.toUpperCase()}
          </div>
        ) : (
          <div className="mini-avatar unassigned" title="Unassigned">?</div>
        )}
      </div>
    </div>
  );
}
