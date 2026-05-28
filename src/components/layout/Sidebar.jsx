import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, BookOpen, Calendar, CheckSquare,
  GraduationCap, BarChart2, Timer, Bell,
  Download, Upload, TrendingUp, Brain, CalendarRange, User,
  MessageSquare, LayoutGrid, Library,
} from 'lucide-react';
import { exportAll, importAll } from '../../services/db';

const NAV = [
  { to: '/',            icon: LayoutDashboard, label: 'Dashboard'        },
  { to: '/subjects',    icon: BookOpen,        label: 'Matières'          },
  { to: '/schedule',    icon: Calendar,        label: 'Emploi du temps'   },
  { to: '/assignments', icon: CheckSquare,     label: 'Devoirs'           },
  { to: '/exams',       icon: GraduationCap,   label: 'Examens'           },
  { to: '/grades',      icon: BarChart2,       label: 'Notes'             },
  { to: '/pomodoro',    icon: Timer,           label: 'Pomodoro'          },
  { to: '/reminders',   icon: Bell,            label: 'Rappels'           },
  null, // divider
  { to: '/assistant',   icon: MessageSquare,   label: 'Assistant IA'      },
  { to: '/library',     icon: Library,         label: 'Bibliothèque'      },
  { to: '/workspace',   icon: LayoutGrid,      label: 'Espace de travail' },
  null, // divider
  { to: '/revision',    icon: Brain,           label: 'Révisions'         },
  { to: '/planner',     icon: CalendarRange,   label: 'Planning auto'     },
  { to: '/analytics',   icon: TrendingUp,      label: 'Statistiques'      },
  { to: '/profile',     icon: User,            label: 'Mon profil'        },
];

export default function Sidebar({ collapsed, inDrawer = false }) {
  const handleExport = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `studyflow_backup_v4_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        await importAll(JSON.parse(await file.text()));
        window.location.reload();
      } catch (_) { alert('Fichier invalide.'); }
    };
    input.click();
  };

  const NavItem = ({ item }) => {
    const { to, icon: Icon, label } = item;
    return (
      <NavLink
        to={to}
        end={to === '/'}
        style={({ isActive }) => ({
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 10px', borderRadius: 8, marginBottom: 1,
          textDecoration: 'none', fontWeight: 500, fontSize: 13,
          whiteSpace: 'nowrap', overflow: 'hidden',
          backgroundColor: isActive ? 'var(--primary)' : 'transparent',
          color: isActive ? 'white' : 'var(--muted)',
          transition: 'background-color 0.15s, color 0.15s',
        })}
        onMouseEnter={(e) => {
          if (!e.currentTarget.style.backgroundColor.includes('rgb(124')) {
            e.currentTarget.style.backgroundColor = 'var(--card)';
            e.currentTarget.style.color = 'var(--text)';
          }
        }}
        onMouseLeave={(e) => {
          if (!e.currentTarget.style.backgroundColor.includes('rgb(124')) {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = 'var(--muted)';
          }
        }}
      >
        <Icon size={16} style={{ flexShrink: 0 }} />
        {!collapsed && label}
      </NavLink>
    );
  };

  return (
    <aside style={{
      width: inDrawer ? '100%' : (collapsed ? 52 : 220),
      minWidth: inDrawer ? 'unset' : (collapsed ? 52 : 220),
      height: '100%', display: 'flex', flexDirection: 'column',
      backgroundColor: 'var(--surface)',
      borderRight: inDrawer ? 'none' : '1px solid var(--border)',
      transition: 'width 0.2s, min-width 0.2s', overflow: 'hidden',
    }}>
      {/* Brand — only shown on desktop (drawer has its own header) */}
      {!inDrawer && (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '14px 10px', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{
          width: 30, height: 30, borderRadius: 8, backgroundColor: 'var(--primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'white', fontWeight: 800, fontSize: 12, flexShrink: 0,
        }}>SF</div>
        {!collapsed && <span style={{ fontWeight: 700, fontSize: 14, whiteSpace: 'nowrap' }}>StudyFlow</span>}
      </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 6px', overflowY: 'auto', overflowX: 'hidden' }}>
        {NAV.map((item, i) => {
          if (item === null) return (
            <div key={`div_${i}`} style={{ height: 1, backgroundColor: 'var(--border)', margin: '6px 4px', flexShrink: 0 }} />
          );
          return <NavItem key={item.to} item={item} />;
        })}
      </nav>

      {/* Footer */}
      <div style={{ padding: '6px', borderTop: '1px solid var(--border)' }}>
        {[
          { icon: Download, label: 'Exporter', action: handleExport },
          { icon: Upload,   label: 'Importer', action: handleImport },
        ].map(({ icon: Icon, label, action }) => (
          <button key={label} onClick={action} title={label} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            width: '100%', padding: '7px 10px', borderRadius: 8,
            background: 'none', border: 'none', color: 'var(--muted)',
            fontSize: 13, fontWeight: 500, cursor: 'pointer',
            whiteSpace: 'nowrap', overflow: 'hidden',
          }}>
            <Icon size={15} style={{ flexShrink: 0 }} />
            {(!collapsed || inDrawer) && label}
          </button>
        ))}
      </div>
    </aside>
  );
}
