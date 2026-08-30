import { useEffect, useState, useCallback } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import Notifications from '../components/Notifications';
import TaskCard from '../components/TaskCard';
import TaskModal from '../components/TaskModal';
import AddTaskForm from '../components/AddTaskForm';
import InviteMemberModal from '../components/InviteMemberModal';

const COLUMNS = [
  { key: 'todo', label: 'To Do' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'done', label: 'Done' },
];

export default function ProjectBoard() {
  const { projectId } = useParams();
  const { user, logout } = useAuth();
  const { socket } = useSocket();

  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTask, setActiveTask] = useState(null);
  const [addingIn, setAddingIn] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [dragOverCol, setDragOverCol] = useState(null);

  const loadProject = useCallback(() => {
    setLoading(true);
    api
      .get(`/projects/${projectId}`)
      .then(({ data }) => {
        setProject(data.project);
        setTasks(data.project.tasks);
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  // Join the project's room for live updates, leave on unmount
  useEffect(() => {
    if (!socket) return;
    socket.emit('project:join', projectId);
    return () => socket.emit('project:leave', projectId);
  }, [socket, projectId]);

  useEffect(() => {
    if (!socket) return;

    const onCreated = (task) => {
      if (task.project_id !== projectId) return;
      setTasks((prev) => (prev.some((t) => t.id === task.id) ? prev : [...prev, task]));
    };
    const onUpdated = (task) => {
      if (task.project_id !== projectId) return;
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
      setActiveTask((prev) => (prev && prev.id === task.id ? task : prev));
    };
    const onDeleted = ({ id, project_id }) => {
      if (project_id !== projectId) return;
      setTasks((prev) => prev.filter((t) => t.id !== id));
      setActiveTask((prev) => (prev && prev.id === id ? null : prev));
    };
    const onMembersChanged = ({ projectId: pid, members }) => {
      if (pid !== projectId) return;
      setProject((prev) => (prev ? { ...prev, members } : prev));
    };

    socket.on('task:created', onCreated);
    socket.on('task:updated', onUpdated);
    socket.on('task:deleted', onDeleted);
    socket.on('project:member_added', onMembersChanged);
    socket.on('project:member_removed', onMembersChanged);

    return () => {
      socket.off('task:created', onCreated);
      socket.off('task:updated', onUpdated);
      socket.off('task:deleted', onDeleted);
      socket.off('project:member_added', onMembersChanged);
      socket.off('project:member_removed', onMembersChanged);
    };
  }, [socket, projectId]);

  function handleTaskCreated(task) {
    setTasks((prev) => [...prev, task]);
    setAddingIn(null);
  }

  function handleTaskUpdated(task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
    setActiveTask(task);
  }

  function handleTaskDeleted(id) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setActiveTask(null);
  }

  function handleDragStart(e, task) {
    e.dataTransfer.setData('text/plain', task.id);
  }

  async function handleDrop(e, status) {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = e.dataTransfer.getData('text/plain');
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;

    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
    try {
      const { data } = await api.patch(`/tasks/${taskId}`, { status });
      setTasks((prev) => prev.map((t) => (t.id === taskId ? data.task : t)));
    } catch {
      loadProject();
    }
  }

  if (loading || !project) {
    return <div className="page-loading">Loading board…</div>;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Link to="/" className="back-link">← Boardly</Link>
        </div>
        <div className="topbar-right">
          <Notifications />
          <div className="avatar" style={{ background: user?.avatar_color }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <button className="link-btn" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="board-page">
        <div className="board-header">
          <div>
            <h1>{project.name}</h1>
            {project.description && <p className="muted">{project.description}</p>}
          </div>
          <div className="board-header-right">
            <div className="member-avatars">
              {project.members.map((m) => (
                <div key={m.id} className="mini-avatar" style={{ background: m.avatar_color }} title={m.name}>
                  {m.name[0]?.toUpperCase()}
                </div>
              ))}
            </div>
            <button className="btn-secondary" onClick={() => setShowInvite(true)}>+ Invite</button>
          </div>
        </div>

        <div className="board-columns">
          {COLUMNS.map((col) => {
            const colTasks = tasks
              .filter((t) => t.status === col.key)
              .sort((a, b) => a.position - b.position);

            return (
              <div
                key={col.key}
                className={`board-column ${dragOverCol === col.key ? 'drag-over' : ''}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCol(col.key);
                }}
                onDragLeave={() => setDragOverCol(null)}
                onDrop={(e) => handleDrop(e, col.key)}
              >
                <div className="column-header">
                  <span>{col.label}</span>
                  <span className="column-count">{colTasks.length}</span>
                </div>

                <div className="column-tasks">
                  {colTasks.map((task) => (
                    <TaskCard key={task.id} task={task} onOpen={setActiveTask} onDragStart={handleDragStart} />
                  ))}
                </div>

                {addingIn === col.key ? (
                  <AddTaskForm
                    projectId={projectId}
                    status={col.key}
                    onCreated={handleTaskCreated}
                    onCancel={() => setAddingIn(null)}
                  />
                ) : (
                  <button className="add-task-btn" onClick={() => setAddingIn(col.key)}>
                    + Add task
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </main>

      {activeTask && (
        <TaskModal
          task={activeTask}
          members={project.members}
          onClose={() => setActiveTask(null)}
          onUpdated={handleTaskUpdated}
          onDeleted={handleTaskDeleted}
        />
      )}

      {showInvite && (
        <InviteMemberModal
          projectId={projectId}
          onClose={() => setShowInvite(false)}
          onInvited={(members) => {
            setProject((prev) => ({ ...prev, members }));
            setShowInvite(false);
          }}
        />
      )}
    </div>
  );
}
