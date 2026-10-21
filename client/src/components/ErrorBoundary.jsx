import React from "react";
import PropTypes from "prop-types";
import { reportError } from "../services/errorReporting";

/**
 * Catches a crash while drawing the app, reports it (console + Umami
 * "client_error"), and shows a way back instead of a blank page.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { crashed: false };
  }

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  componentDidCatch(error) {
    reportError("render", error);
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div role="alert" className="min-h-[100dvh] flex flex-col items-center justify-center gap-4 px-6 text-center text-white">
        <div className="text-4xl" aria-hidden="true">😵</div>
        <h1 className="font-display text-2xl font-bold m-0">Something went wrong</h1>
        <p className="text-sm text-white/60 m-0 max-w-xs">
          The page hit an error. Reloading usually fixes it — your stats are saved.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="h-11 px-5 rounded-xl font-bold text-sm btn-primary"
        >
          Reload
        </button>
      </div>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};
