import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { config } from 'src/ui-config';

interface IUserContextType {
  credentials: Credentials;
  isLoading: boolean;
  setCredentials: (
    username: string,
    password: string,
    remember?: boolean,
  ) => void;
  clearCredentials: () => void;
  updateUsername: (username: string) => void;
  updatePassword: (password: string) => void;
}

interface Credentials {
  username: string;
  password: string;
  remember: boolean;
  authentication?: 'basic' | 'session';
}

const UserContext = createContext<IUserContextType>(undefined);
export const useUserContext = () => useContext(UserContext);

function cachedCredentials() {
  if (!window.sessionStorage.credentials && !window.localStorage.credentials) {
    return null;
  }

  try {
    return JSON.parse(
      window.sessionStorage.credentials || window.localStorage.credentials,
    );
  } catch (_e) {
    return null;
  }
}

export const UserContextProvider = ({ children }: { children: ReactNode }) => {
  const [credentials, setCredentials] = useState(cachedCredentials());
  const [isLoading, setIsLoading] = useState(
    Boolean(config.UI_EXTERNAL_LOGIN_URI && !credentials),
  );

  useEffect(() => {
    if (credentials || !config.UI_EXTERNAL_LOGIN_URI) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    const restoreSession = async () => {
      // In SSO mode the API does not advertise Basic authentication. A single
      // cookie-authenticated request can therefore restore an existing Django
      // session without triggering the browser's native credential dialog.
      const response = await fetch(`${config.API_BASE_PATH}tasks/?limit=1`, {
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        return;
      }

      const apiPage = await fetch(`${config.API_BASE_PATH}users/?limit=1`, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      const apiDocument = new DOMParser().parseFromString(
        await apiPage.text(),
        'text/html',
      );
      const username = apiDocument
        .querySelector('a.dropdown-toggle[href="#"]')
        ?.textContent?.trim();

      if (!cancelled) {
        setCredentials({
          username: username || 'Entra ID',
          password: '',
          remember: false,
          authentication: 'session',
        });
      }
    };

    restoreSession()
      .catch(() => null)
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (credentials?.authentication === 'session') {
      window.localStorage.removeItem('credentials');
      window.sessionStorage.credentials = JSON.stringify(credentials);
    } else if (credentials) {
      window.sessionStorage.credentials = JSON.stringify(credentials);
    }
    if (credentials?.remember && credentials.authentication !== 'session') {
      window.localStorage.credentials = JSON.stringify(credentials);
    }
    if (!credentials) {
      window.localStorage.removeItem('credentials');
      window.sessionStorage.removeItem('credentials');
    }
  }, [credentials]);

  const clearCredentials = async () => {
    if (credentials?.authentication === 'session') {
      // Django 5's LogoutView accepts POST only. Obtain the CSRF token from
      // the authenticated browsable API page, then end the server-side
      // session before returning to the anonymous UI.
      const apiPage = await fetch(`${config.API_BASE_PATH}users/?limit=1`, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      const apiDocument = new DOMParser().parseFromString(
        await apiPage.text(),
        'text/html',
      );
      const csrfToken = apiDocument
        .querySelector<HTMLInputElement>(
          'input[name="csrfmiddlewaretoken"]',
        )
        ?.value;

      if (csrfToken) {
        await fetch('/auth/logout/', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-CSRFToken': csrfToken,
          },
          body: new URLSearchParams({
            csrfmiddlewaretoken: csrfToken,
            next: '/ui/status/',
          }),
        });
      }
    }

    // Clear the client-side identity synchronously before navigating. Waiting
    // for React's effect can leave stale session credentials in storage while
    // the replacement document is already loading.
    window.localStorage.removeItem('credentials');
    window.sessionStorage.removeItem('credentials');
    setCredentials(null);
    window.location.assign('/ui/status/');
  };

  return (
    <UserContext.Provider
      value={{
        credentials,
        isLoading,
        setCredentials: (username, password, remember = false) =>
          setCredentials({
            username,
            password,
            remember,
            authentication: 'basic',
          }),
        clearCredentials,
        updateUsername: (username) =>
          setCredentials((credentials) => ({ ...credentials, username })),
        updatePassword: (password) =>
          setCredentials((credentials) => ({ ...credentials, password })),
      }}
    >
      {children}
    </UserContext.Provider>
  );
};
