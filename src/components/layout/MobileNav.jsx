import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, Timer, MessageSquare, User,
} from 'lucide-react';

const TABS = [
  { to: '/',            icon: LayoutDashboard, label: 'Accueil'   },
  { to: '/assignments', icon: CheckSquare,     label: 'Devoirs'   },
  { to: '/pomodoro',    icon: Timer,           label: 'Pomodoro'  },
  { to: '/assistant',   icon: MessageSquare,   label: 'IA'        },
  { to: '/profile',     icon: User,            label: 'Profil'    },
];

export default function MobileNav() {
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      backgroundColor: 'var(--surface)',
      borderTop: '1px solid var(--border)',
      display: 'flex', alignItems: 'stretch',
      paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {TABS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={({ isActive }) => ({
            flex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: '9px 4px',
            textDecoration: 'none',
            color: isActive ? 'var(--primary)' : 'var(--muted)',
            fontWeight: isActive ? 700 : 500,
            fontSize: 10.5,
            transition: 'color 0.15s',
          })}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.5 : 1.8} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
