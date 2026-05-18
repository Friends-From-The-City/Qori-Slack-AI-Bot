/**
 * Jest global teardown for integration tests.
 * Nothing to clean up — the tmpfs-backed Docker container is ephemeral.
 */

export default async function globalTeardown() {
  // Container cleanup is the caller's responsibility (docker compose down).
  // This file exists so jest.integration.config.js has a valid path.
}
