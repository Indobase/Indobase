# Indobase Social (production compose)

Deploy from this directory on the control-plane VPS (`/opt/indobase-social/docker/deploy`).

## Temporal dynamicconfig permissions

The `temporal` service mounts `../../dynamicconfig` read-only and runs as **uid 1000**.

If Temporal crash-loops with:

`config/dynamicconfig/development-sql.yaml: permission denied`

fix host perms (keep the `:ro` mount):

```bash
chmod 755 /opt/indobase-social /opt/indobase-social/dynamicconfig
chmod 644 /opt/indobase-social/dynamicconfig/*.yaml
cd /opt/indobase-social/docker/deploy && docker compose up -d --force-recreate temporal
```

Do not leave the tree at `700` after sync from a workstation; Temporal cannot `stat` the YAML otherwise.
