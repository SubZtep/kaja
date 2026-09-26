---
layout: page
title: Postgres on a volume
parent: Development
nav_order: 8
---

# Postgres on a Hetzner Volume

This guide moves the Kaja Postgres database from the server's main disk to a separate Hetzner Volume. A Hetzner Volume survives server rebuilds — you can delete and recreate the server, reattach the volume, and your database is still there.

Replace anything in `<angle brackets>` with your own values.

---

## 1. Create the volume (Hetzner Console)

1. Go to the [Hetzner Cloud Console](https://console.hetzner.cloud/).
2. Open your project, click **Volumes** → **Create Volume**.
3. Pick the same location/region as your server.
4. Set a size (leave room to grow — resizing later is easy, shrinking is not).
5. Attach it to your Kaja server directly in this step (there's an "Attach to Server" option).
6. Choose **Automatic** mounting (filesystem ext4) — Hetzner then formats the volume, mounts it at `/mnt/HC_Volume_<id>` and adds the `/etc/fstab` entry for you.
7. Click **Create & Buy now**.

## 2. Check the mount on the server

SSH into your server:

```bash
ssh root@<your-server>
```

Confirm the volume is mounted and in fstab:

```bash
df -h | grep HC_Volume
grep HC_Volume /etc/fstab
```

Both should show `/mnt/HC_Volume_<id>`. Then create the folder Postgres will use — a subfolder, because the volume's root holds `lost+found`, and Postgres won't create a new database in a data folder that isn't empty:

```bash
mkdir /mnt/HC_Volume_<id>/pgdata
```

Use `/mnt/HC_Volume_<id>/pgdata` wherever this guide says `/mnt/kaja-pgdata/pgdata`, and skip to step 5.

If you chose **Manual** mounting instead (or the automatic mount didn't happen), do steps 3–4 yourself. List disks to find the new volume:

```bash
lsblk
```

You'll see a new device, usually something like `/dev/sdb`. Also get its stable ID (safer than `/dev/sdb`, which can change):

```bash
ls -l /dev/disk/by-id/ | grep scsi-0HC_Volume
```

Note this path — it looks like `/dev/disk/by-id/scsi-0HC_Volume_12345678`.

## 3. Format and mount the volume (manual only)

Format it (⚠️ this wipes the volume — only do this once, on a fresh volume):

```bash
mkfs.ext4 /dev/disk/by-id/scsi-0HC_Volume_12345678
```

Create a mount point and mount it:

```bash
mkdir -p /mnt/kaja-pgdata
mount /dev/disk/by-id/scsi-0HC_Volume_12345678 /mnt/kaja-pgdata
mkdir /mnt/kaja-pgdata/pgdata
```

## 4. Make the mount permanent (manual only)

Without this step, the volume won't be mounted after a reboot.

Open `/etc/fstab`:

```bash
nano /etc/fstab
```

Add this line at the end (use the `by-id` path from step 2):

```
/dev/disk/by-id/scsi-0HC_Volume_12345678 /mnt/kaja-pgdata ext4 defaults,nofail 0 2
```

Save, then test it works:

```bash
umount /mnt/kaja-pgdata
mount -a
```

If no error appears, it worked.

## 5. Find the current Postgres volume name

From your local machine (with the `disco` CLI installed):

```bash
disco volumes:list --project <postgres-addon-project-name>
```

This lists the volume name(s) Disco uses for Postgres. Note the exact name — call it `<volume-name>` below.

## 6. Back up the current data

Still on your local machine:

```bash
disco volumes:export --project <postgres-addon-project-name> --volume <volume-name> --output pg-backup.tar.gz
```

This downloads a full backup of the current database volume. **Keep this file safe until the whole process is confirmed working.**

## 7. Stop Postgres

In the Disco dashboard (or CLI), stop/scale down the Postgres addon service so nothing writes to the database during the move.

## 8. Point the volume at the Hetzner disk

Back on the **server**, find and remove the old Docker volume, then recreate it as a bind mount to your new disk:

```bash
docker volume inspect <volume-name>   # confirm it exists first
docker volume rm <volume-name>
docker volume create \
  --driver local \
  --opt type=none \
  --opt o=bind \
  --opt device=/mnt/kaja-pgdata/pgdata \
  <volume-name>
```

This makes Docker's volume named `<volume-name>` actually point at `/mnt/kaja-pgdata/pgdata` — which is your Hetzner Volume.

## 9. Restore the data

Back on your local machine:

```bash
disco volumes:import --project <postgres-addon-project-name> --volume <volume-name> --input pg-backup.tar.gz
```

This writes the backup into the newly relocated volume.

## 10. Restart Postgres

Start/scale the Postgres addon service back up in Disco.

## 11. Verify

- Check Postgres logs for errors.
- Connect to the database and confirm your data (tables, row counts) is intact.
- Confirm the data really lives on the volume (`/mnt/HC_Volume_<id>` if it was mounted automatically):

  ```bash
  df -h /mnt/kaja-pgdata
  ```

  It should show real disk usage matching your database size.

---

## Why this matters

If you ever rebuild or replace the server:

1. Create a new server.
2. Attach the same Hetzner Volume to it.
3. Mount it — in the Console's attach dialog pick **Automatic** (on an existing volume it only mounts, it doesn't format), or repeat steps 3–4 by hand without the `mkfs` line. The data is already there.
4. Reinstall Disco, set up the same volume-to-bind-mount step (step 8) before starting Postgres.

Your database data survives, because it never lived on the server's main disk in the first place.

---

Next:

[Debug flow](/development/debug-flow){: .btn .btn-green .fs-5 }
