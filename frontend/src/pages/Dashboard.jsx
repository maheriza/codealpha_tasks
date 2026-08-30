import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../context/AuthContext';
import Notifications from '../components/Notifications';
import CreateProjectModal from '../components/CreateProjectModal';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    api
      .get('/projects')
      .then(({ data }) => setProjects(data.projects))
      .finally(() => setLoading(false));
  }, []);

  function handleCreated(project) {
    setProjects((prev) => [{ ...project, task_count: 0 }, ...prev]);
    setShowCreate(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">Boardly</div>
        <div className="topbar-right">
          <Notifications />
          <div className="avatar" style={{ background: user?.avatar_color }}>
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <button className="link-btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <main className="dashboard">
        <div className="dashboard-header">
          <h1>Your projects</h1>
          <button onClick={() => setShowCreate(true)}>+ New project</button>
        </div>

        {loading && <p>Loading projects…</p>}

        {!loading && projects.length === 0 && (
          <div className="empty-state">
            <p>You don't have any projects yet.</p>
            <button onClick={() => setShowCreate(true)}>Create your first project</button>
          </div>
        )}

        <div className="project-grid">
          {projects.map((p) => (
            <Link to={`/projects/${p.id}`} key={p.id} className="project-card">
              <h3>{p.name}</h3>
              <p>{p.description || 'No description'}</p>
              <div className="project-meta">{p.task_count} task{p.task_count === 1 ? '' : 's'}</div>
            </Link>
          ))}
        </div>
      </main>

      {showCreate && <CreateProjectModal onClose={() => setShowCreate(false)} onCreated={handleCreated} />}
    </div>
  );
}
