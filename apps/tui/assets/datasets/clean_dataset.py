import json, sys

def is_junk(msg_content):
    return False
    junk_markers = ["[INST]", "<<SYS>>", "<</SYS>>", "</s>", "<s>"]
    return any(m in msg_content for m in junk_markers) or msg_content.strip() == ""

def clean_dpo_file(path_in, path_out):
    kept, dropped = 0, 0
    with open(path_in) as f, open(path_out, "w") as out:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            user_msg = row.get("input", {}).get("messages", [{}])[0].get("content", "")
            pref = row.get("preferred_output", [{}])[0].get("content", "")
            if is_junk(user_msg) or is_junk(pref):
                dropped += 1
                continue
            out.write(json.dumps(row) + "\n")
            kept += 1
    print(f"kept={kept} dropped={dropped}")

if __name__ == "__main__":
    clean_dpo_file(sys.argv[1], sys.argv[2])
