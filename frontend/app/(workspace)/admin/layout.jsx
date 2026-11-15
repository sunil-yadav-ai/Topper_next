import RouteGuard from "../../../src/components/RouteGuard.jsx";

export default function AdminLayout({ children }) {
  return <RouteGuard role="admin">{children}</RouteGuard>;
}
