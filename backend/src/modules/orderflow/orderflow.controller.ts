import { Controller, Get, Post, Query } from "@nestjs/common";
import { OrderflowService } from "./orderflow.service";
@Controller("orderflow")
export class OrderflowController {
  constructor(private readonly feed: OrderflowService) {}
  @Get("stream") snapshot(
    @Query("source") source = "live",
    @Query("after") after = "0",
    @Query("epoch") epoch?: string,
  ) {
    return this.feed.snapshot(source, Math.max(0, Number(after) || 0), epoch);
  }
  @Post("demo/disconnect") disconnect() {
    this.feed.disconnectDemo();
    return { ok: true };
  }
}
