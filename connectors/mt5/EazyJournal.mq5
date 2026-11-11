#property copyright "eazy trading"
#property version "1.00"
#property strict
// Read-only script. No trading, DLLs, HTTP or third-party Expert Advisors.
string Q(string value) {
   string out="\"";
   for(int i=0;i<StringLen(value);i++) {
      ushort c=StringGetCharacter(value,i);
      if(c==34) out+="\\\"";
      else if(c==92) out+="\\\\";
      else if(c<32) out+=StringFormat("\\u%04x",c);
      else out+=ShortToString(c);
   }
   return out+"\"";
}
string N(double value) { return DoubleToString(value,12); }
string U(ulong value) { return Q(StringFormat("%I64u",value)); }
void ErrorFile(string code) {
   int f=FileOpen("eazy-error.tmp",FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(f!=INVALID_HANDLE) { FileWriteString(f,code); FileClose(f); FileMove("eazy-error.tmp",0,"eazy-error.txt",FILE_REWRITE); }
}
void OnStart() {
   uint began=GetTickCount();
   while(!IsStopped() && !TerminalInfoInteger(TERMINAL_CONNECTED) && GetTickCount()-began<120000) Sleep(500);
   if(!TerminalInfoInteger(TERMINAL_CONNECTED) || AccountInfoInteger(ACCOUNT_LOGIN)==0) { ErrorFile("LOGIN_FAILED"); return; }
   if(AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)) { ErrorFile("READ_ONLY_REQUIRED"); return; }
   // Server time is kept as broker time throughout the journal.
   if(!HistorySelect(0,TimeTradeServer()+86400)) { ErrorFile("HISTORY_FAILED"); return; }
   int total=HistoryDealsTotal();
   if(total>50000 || PositionsTotal()>2000) { ErrorFile("HISTORY_TOO_LARGE"); return; }
   ulong login=(ulong)AccountInfoInteger(ACCOUNT_LOGIN);
   string server=AccountInfoString(ACCOUNT_SERVER);
   int f=FileOpen("eazy-history.tmp",FILE_WRITE|FILE_TXT|FILE_ANSI,0,CP_UTF8);
   if(f==INVALID_HANDLE) { ErrorFile("HISTORY_FAILED"); return; }
   string account="{\"kind\":\"account\",\"login\":"+U(login)+",\"server\":"+Q(server)+",\"currency\":"+Q(AccountInfoString(ACCOUNT_CURRENCY))+",\"readOnly\":true}";
   FileWriteString(f,account+"\n");
   for(int i=0;i<total && !IsStopped();i++) {
      ulong t=HistoryDealGetTicket(i);
      if(t==0) { FileClose(f); ErrorFile("HISTORY_FAILED"); return; }
      string line="{\"kind\":\"deal\",\"ticket\":"+U(t)+",\"positionId\":"+U((ulong)HistoryDealGetInteger(t,DEAL_POSITION_ID));
      line+=",\"timeMsc\":"+StringFormat("%I64d",HistoryDealGetInteger(t,DEAL_TIME_MSC));
      line+=",\"type\":"+IntegerToString(HistoryDealGetInteger(t,DEAL_TYPE))+",\"entry\":"+IntegerToString(HistoryDealGetInteger(t,DEAL_ENTRY));
      line+=",\"symbol\":"+Q(HistoryDealGetString(t,DEAL_SYMBOL));
      line+=",\"volume\":"+N(HistoryDealGetDouble(t,DEAL_VOLUME))+",\"price\":"+N(HistoryDealGetDouble(t,DEAL_PRICE));
      line+=",\"profit\":"+N(HistoryDealGetDouble(t,DEAL_PROFIT))+",\"commission\":"+N(HistoryDealGetDouble(t,DEAL_COMMISSION));
      line+=",\"swap\":"+N(HistoryDealGetDouble(t,DEAL_SWAP))+",\"fee\":"+N(HistoryDealGetDouble(t,DEAL_FEE));
      line+=",\"sl\":"+N(HistoryDealGetDouble(t,DEAL_SL))+",\"tp\":"+N(HistoryDealGetDouble(t,DEAL_TP))+"}";
      FileWriteString(f,line+"\n");
   }
   int positions=PositionsTotal();
   for(int i=0;i<positions && !IsStopped();i++) {
      ulong ticket=PositionGetTicket(i);
      if(ticket==0) { FileClose(f); ErrorFile("HISTORY_FAILED"); return; }
      string line="{\"kind\":\"position\",\"ticket\":"+U(ticket)+",\"symbol\":"+Q(PositionGetString(POSITION_SYMBOL));
      line+=",\"side\":"+Q(PositionGetInteger(POSITION_TYPE)==POSITION_TYPE_BUY ? "buy" : "sell");
      line+=",\"volume\":"+N(PositionGetDouble(POSITION_VOLUME))+",\"price\":"+N(PositionGetDouble(POSITION_PRICE_OPEN));
      line+=",\"profit\":"+N(PositionGetDouble(POSITION_PROFIT))+",\"swap\":"+N(PositionGetDouble(POSITION_SWAP));
      line+=",\"sl\":"+N(PositionGetDouble(POSITION_SL))+",\"tp\":"+N(PositionGetDouble(POSITION_TP))+"}";
      FileWriteString(f,line+"\n");
   }
   // Do not publish interrupted, disconnected or switched-account exports.
   if(IsStopped() || !TerminalInfoInteger(TERMINAL_CONNECTED) || (ulong)AccountInfoInteger(ACCOUNT_LOGIN)!=login || AccountInfoString(ACCOUNT_SERVER)!=server || PositionsTotal()!=positions || !HistorySelect(0,TimeTradeServer()+86400) || HistoryDealsTotal()!=total) {
      FileClose(f); ErrorFile("HISTORY_FAILED"); return;
   }
   FileWriteString(f,"{\"kind\":\"complete\",\"deals\":"+IntegerToString(total)+",\"positions\":"+IntegerToString(positions)+"}\n");
   FileFlush(f); FileClose(f);
   if(!FileMove("eazy-history.tmp",0,"eazy-history.jsonl",FILE_REWRITE)) ErrorFile("HISTORY_FAILED");
}
