import { useState, useEffect, useRef } from 'react';
import { checkConnection } from '~/lib/api/connection';

const ACKNOWLEDGED_CONNECTION_ISSUE_KEY = 'bolt_acknowledged_connection_issue';
const POLL_INTERVAL_MS = 30_000;
const HIGH_LATENCY_MS = 2_500;
/** Require consecutive failures before surfacing "Connection lost". */
const FAILURES_BEFORE_DISCONNECT = 2;

type ConnectionIssueType = 'disconnected' | 'high-latency' | null;

const getAcknowledgedIssue = (): string | null => {
  try {
    return localStorage.getItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
  } catch {
    return null;
  }
};

export const useConnectionStatus = () => {
  const [hasConnectionIssues, setHasConnectionIssues] = useState(false);
  const [currentIssue, setCurrentIssue] = useState<ConnectionIssueType>(null);
  const [acknowledgedIssue, setAcknowledgedIssue] = useState<string | null>(() => getAcknowledgedIssue());
  const consecutiveFailuresRef = useRef(0);
  const inFlightRef = useRef(false);

  const applyIssue = (issue: ConnectionIssueType) => {
    setCurrentIssue(issue);
    setHasConnectionIssues(issue !== null && issue !== acknowledgedIssue);
  };

  const checkStatus = async () => {
    if (inFlightRef.current) {
      return;
    }

    inFlightRef.current = true;

    try {
      const status = await checkConnection();

      if (!status.connected) {
        consecutiveFailuresRef.current += 1;

        if (consecutiveFailuresRef.current >= FAILURES_BEFORE_DISCONNECT) {
          applyIssue('disconnected');
        }

        return;
      }

      consecutiveFailuresRef.current = 0;
      const issue: ConnectionIssueType = status.latency > HIGH_LATENCY_MS ? 'high-latency' : null;
      applyIssue(issue);
    } catch (error) {
      console.error('Failed to check connection:', error);
      consecutiveFailuresRef.current += 1;

      if (consecutiveFailuresRef.current >= FAILURES_BEFORE_DISCONNECT) {
        applyIssue('disconnected');
      }
    } finally {
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
    void checkStatus();

    const interval = setInterval(() => {
      void checkStatus();
    }, POLL_INTERVAL_MS);

    const onOnline = () => {
      consecutiveFailuresRef.current = 0;
      void checkStatus();
    };

    const onOffline = () => {
      // Browser offline event is a hint; confirm with a probe before alarming.
      void checkStatus();
    };

    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [acknowledgedIssue]);

  const acknowledgeIssue = () => {
    try {
      if (currentIssue) {
        localStorage.setItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY, currentIssue);
      }
    } catch {
      // ignore storage errors
    }

    setAcknowledgedIssue(currentIssue);
    setHasConnectionIssues(false);
  };

  const resetAcknowledgment = () => {
    try {
      localStorage.removeItem(ACKNOWLEDGED_CONNECTION_ISSUE_KEY);
    } catch {
      // ignore storage errors
    }

    setAcknowledgedIssue(null);
    consecutiveFailuresRef.current = 0;
    void checkStatus();
  };

  return { hasConnectionIssues, currentIssue, acknowledgeIssue, resetAcknowledgment };
};
