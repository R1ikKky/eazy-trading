"""No network: exercise the actual SDK record types and worker subscription/recovery path."""
import contextlib
import io
import json
import os
import unittest
from unittest.mock import patch
import databento as db
import databento_live as adapter

class AdapterTest(unittest.TestCase):
    def record(self, side="B", sequence=1):
        return db.TradeMsg(publisher_id=1,instrument_id=42,ts_event=1704672000123456789,
            price=16400250000000,size=7,action=db.Action.TRADE,side={"A":db.Side.ASK,"B":db.Side.BID,"N":db.Side.NONE}[side],depth=0,
            ts_recv=1704672000123456799,sequence=sequence)

    def test_actual_sdk_records_aggressor_precision_and_identity(self):
        for side, expected in [("A","sell"),("B","buy"),("N","unknown")]:
            event=adapter.normalize(self.record(side),"NQH24")
            self.assertEqual(event["side"],expected)
            self.assertEqual(event["timeNs"],"1704672000123456789")
            self.assertEqual(event["price"],16400.25)
            self.assertEqual(event["size"],7)
            self.assertEqual(event,adapter.normalize(self.record(side),"NQH24"))
        self.assertNotEqual(adapter.normalize(self.record(),"NQH24")["id"],adapter.normalize(self.record(sequence=2),"NQH24")["id"])

    def test_subscription_and_inclusive_resume_without_credentials(self):
        calls=[]
        class FakeLive:
            def __init__(self,**kwargs):
                self.symbology_map={42:"NQH24"};self.number=len(calls);calls.append({"constructor":kwargs,"subscriptions":[]})
            def subscribe(self,**kwargs):calls[self.number]["subscriptions"].append(kwargs)
            def add_callback(self,fn,error):self.fn=fn
            def start(self):pass
            def block_for_close(self):self.fn(AdapterTest().record());raise ConnectionError()
            def terminate(self):pass
        ticks=iter([None, RuntimeError("test complete")])
        def sleep(_):
            result=next(ticks)
            if result:raise result
        output=io.StringIO()
        with patch.object(adapter.db,"Live",FakeLive),patch.object(adapter.time,"sleep",sleep),patch.object(adapter.time,"time_ns",return_value=1704672001123456789),patch.dict(os.environ,{"ORDERFLOW_CONTRACTS":json.dumps({"NQ":"NQH24","ES":"ESH24"})}),contextlib.redirect_stdout(output):
            with self.assertRaisesRegex(RuntimeError,"test complete"):adapter.run()
        self.assertEqual(calls[0]["subscriptions"][0],{"dataset":"GLBX.MDP3","schema":"trades","stype_in":"raw_symbol","symbols":["NQH24"]})
        self.assertEqual(calls[1]["subscriptions"][0]["start"],1704671999123456789)
        self.assertEqual(calls[0]["constructor"]["slow_reader_behavior"],"warn")
        values=[json.loads(line) for line in output.getvalue().splitlines()]
        self.assertTrue(any(v.get("state")=="interrupted" for v in values))
        trades=[v["event"] for v in values if v["type"]=="trade"]
        self.assertEqual(trades[0],trades[1])

if __name__=="__main__":unittest.main()
