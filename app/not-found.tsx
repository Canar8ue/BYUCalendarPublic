import CampusExplorer from './campus-explorer';

// This remains the framework's real missing-page boundary. The world and its
// renderer load only after the visitor deliberately starts the adventure.
export default function NotFound() {
  return <CampusExplorer missing/>;
}
