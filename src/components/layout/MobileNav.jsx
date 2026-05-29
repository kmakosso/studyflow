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
      width: '100%', maxWidth: '100%',
    }}>
      {TABS.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          style={({ isActive }) => ({
            flex: 1, minWidth: 0,                 /* parts égales, jamais de débordement */
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 3, padding: '9px 2px',
            textDecoration: 'none',
            color: isActive ? 'var(--primary)' : 'var(--muted)',
            fontWeight: 600,                      /* poids FIXE → pas de tressautement */
            fontSize: 10.5,
            lineHeight: 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            WebkitTapHighlightColor: 'transparent',
            transition: 'color 0.15s',
          })}
        >
          {({ isActive }) => (
            <>
              <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} />
              <span style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
