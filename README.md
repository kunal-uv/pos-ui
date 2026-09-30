# Shared POS UI

Reusable staff-only point-of-sale client for Appliance Outlet, Rent Buddyz, and future platform admin panels.

The package renders catalog search, serialized-unit selection, rental terms, customer lookup/creation, pickup or delivery fulfilment, signature capture, tender selection, and idempotent checkout against `shared-pos-service`.

## Distribution

Run `npm run build`, then publish the package to the organization's private npm registry. Admin repositories use `portal:../shared-pos-ui` for local multi-repository development, which links the source directly and supports Next.js hot reload without reinstalling after every edit. Deployment should resolve the same version from the private registry.

The host provides its current platform JWT, tenant id, and selected store. The package never persists credentials and delegates authorization to the shared service.
