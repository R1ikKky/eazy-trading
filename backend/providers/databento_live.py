"""Official Databento SDK boundary. stdout is NDJSON; secrets never leave this process."""
import json
import os
import time
import hashlib
import databento as db

def emit(value):
    print(json.dumps(value, separators=(",", ":")), flush=True)

def normalize(record, contract):
    side = str(record.side)
    identity = [int(record.publisher_id), int(record.instrument_id), int(record.sequence),
                int(record.ts_event), int(record.ts_recv), int(record.price), int(record.size),
                side, int(record.flags), int(record.depth)]
    return {"id": "db-" + hashlib.sha256(json.dumps(identity).encode()).hexdigest(),
            "timeNs": str(record.ts_event), "instrument": "NQ" if contract.startswith("NQ") else "ES",
            "contract": contract, "price": int(record.price) / 1_000_000_000,
            "size": int(record.size), "side": {"B": "buy", "A": "sell"}.get(side, "unknown")}

def run():
    symbols = json.loads(os.environ["ORDERFLOW_CONTRACTS"])
    cursors = {}
    delay = 1
    while True:
        emit({"type": "status", "state": "connecting"})
        client = db.Live(reconnect_policy="none", heartbeat_interval_s=5, slow_reader_behavior="warn")
        replaying = bool(cursors)
        streaming = False
        try:
            for contract in symbols.values():
                start = cursors.get(contract)
                if start is not None and time.time_ns() - start >= 86_390_000_000_000:
                    emit({"type": "gap", "message": "Provider replay window expired", "fromNs": str(start)})
                    start = None
                args = dict(dataset="GLBX.MDP3", schema="trades", stype_in="raw_symbol", symbols=[contract])
                if start is not None:
                    args["start"] = max(0, start - 1_000_000_000)  # inclusive overlap, deduplicated by gateway
                client.subscribe(**args)
            streaming = False
            def receive(record):
                nonlocal streaming, delay
                if isinstance(record, db.TradeMsg):
                    contract = client.symbology_map.get(record.instrument_id)
                    if contract not in symbols.values():
                        emit({"type": "gap", "message": "Unresolved provider instrument mapping"})
                        return
                    event = normalize(record, contract)
                    emit({"type": "trade", "event": event})
                    cursors[contract] = max(cursors.get(contract, 0), int(record.ts_event))
                    if not streaming:
                        emit({"type": "status", "state": "live"})
                        streaming = True
                        delay = 1
                elif isinstance(record, db.SystemMsg) and any(word in str(record).lower() for word in ("slow", "skip", "gap")):
                    emit({"type": "gap", "message": "Provider reported degraded continuity"})
                elif isinstance(record, db.ErrorMsg):
                    streaming = False
                    emit({"type": "gap", "message": "Provider reported an error or incomplete recovery"})
                    client.terminate()
            def callback_error(_error):
                nonlocal streaming
                streaming = False
                emit({"type": "gap", "message": "Provider record could not be normalized"})
                client.terminate()
            client.add_callback(receive, callback_error)
            client.start()
            client.block_for_close()
        except Exception:
            # Never serialize an exception that might contain connection parameters.
            pass
        finally:
            client.terminate()
        emit({"type": "status", "state": "interrupted"})
        if replaying and not streaming:
            emit({"type": "gap", "message": "Replay recovery failed; reconnecting at stream head"})
            cursors.clear()
        time.sleep(delay)
        delay = min(delay * 2, 30)

if __name__ == "__main__":
    run()
