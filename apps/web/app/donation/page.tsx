'use client'

import React, { useState } from "react";
import {
  Heart,
  User,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

export default function BuyMeCoffeeSePay() {
  const [amount, setAmount] = useState<number>(50000); // Mặc định gợi ý 50k
  const [customAmountText, setCustomAmountText] = useState<string>("50,000");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const QUICK_AMOUNTS = [20000, 50000, 100000, 200000];

  // Xử lý khi user bấm vào các nút chọn tiền nhanh
  const handleQuickAmountClick = (value: number) => {
    setAmount(value);
    setCustomAmountText(value.toLocaleString("vi-VN"));
  };

  // Xử lý khi user tự nhập số tiền thủ công vào ô input
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Chỉ lấy các ký tự số
    const rawValue = e.target.value.replace(/\D/g, "");
    const numericValue = parseInt(rawValue) || 0;

    setAmount(numericValue);
    setCustomAmountText(
      numericValue > 0 ? numericValue.toLocaleString("vi-VN") : "",
    );
  };

  const handlePayment = async () => {
    if (amount < 10000) {
      alert(
        "Số tiền quyên góp tối thiểu là 10.000đ để hệ thống ngân hàng xử lý.",
      );
      return;
    }

    setIsLoading(true);
    try {
      // Giả lập flow gọi API tạo giao dịch và hiển thị cổng SePay QR
      // Sau này bạn sẽ gọi tới Supabase Edge Function của bạn tại đây để sinh mã QR động
      console.log({ amount, name: isAnonymous ? "Ẩn danh" : name, message });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground antialiased selection:bg-accent-soft selection:text-primary transition-colors duration-300">
      <div className="h-48 md:h-64 bg-gradient-hero w-full relative" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 -mt-20 relative pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-1 bg-surface border border-border rounded-xl p-6 shadow-md animate-fade-up">
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-accent-soft border-4 border-surface shadow-md flex items-center justify-center -mt-16 overflow-hidden">
                <User className="w-12 h-12 text-primary" />
              </div>

              <h1 className="mt-4 text-xl font-bold font-sans tracking-tight">
                Nghĩa Võ
              </h1>
              <p className="text-sm text-secondary mt-1">
                Đang xây dựng các ứng dụng và nội dung sáng tạo
              </p>

              <div className="mt-4 flex items-center gap-2 text-xs bg-accent-soft text-primary px-3 py-1.5 rounded-full font-medium">
                <Heart className="w-3.5 h-3.5 fill-current animate-pulse-soft" />
                <span>Được ủng hộ bởi 142 người bạn</span>
              </div>

              <hr className="w-full my-6 border-border" />

              <div className="w-full text-left space-y-4">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  Về dự án
                </h3>
                <p className="text-sm text-secondary leading-relaxed">
                  Chào bạn! Mình đang phát triển ứng dụng và viết blog công
                  nghệ. Mọi sự ủng hộ dù lớn hay nhỏ từ bạn đều là nguồn động
                  lực và kinh phí to lớn giúp mình duy trì hệ thống máy chủ và
                  tiếp tục sáng tạo.
                </p>
              </div>
            </div>
          </div>

          <div
            className="lg:col-span-2 space-y-6 animate-fade-up"
            style={{ animationDelay: "100ms" }}
          >
            <div className="bg-surface border border-border rounded-xl p-6 md:p-8 shadow-md">
              <h2 className="text-lg font-bold font-sans flex items-center gap-2 border-b border-border pb-4">
                <Sparkles className="w-5 h-5 text-primary" />
                Gửi quà tặng tiếp sức động lực
              </h2>

              <div className="mt-6 space-y-4">
                <label className="block text-xs font-semibold text-secondary uppercase tracking-wider">
                  Chọn hoặc nhập số tiền quyên góp (VNĐ)
                </label>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {QUICK_AMOUNTS.map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => handleQuickAmountClick(val)}
                      className={`py-3 px-4 text-sm font-mono font-bold rounded-md transition-all border ${
                        amount === val
                          ? "bg-primary text-primary-foreground border-primary shadow-sm shadow-glow"
                          : "bg-surface hover:bg-elevated text-foreground border-border"
                      }`}
                    >
                      {val.toLocaleString("vi-VN")}đ
                    </button>
                  ))}
                </div>

                <div className="relative mt-2 rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                    <span className="text-muted-foreground font-mono font-bold text-base">
                      ₫
                    </span>
                  </div>
                  <input
                    type="text"
                    name="custom-amount"
                    id="custom-amount"
                    value={customAmountText}
                    onChange={handleInputChange}
                    placeholder="Nhập số tiền tùy ý khác..."
                    className="w-full pl-10 pr-4 py-4 bg-input border border-border rounded-md font-mono font-bold text-base focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-foreground"
                  />
                </div>
              </div>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
                    Tên của bạn hoặc Biệt danh
                  </label>
                  <input
                    type="text"
                    disabled={isAnonymous}
                    placeholder={
                      isAnonymous ? "Người bạn ẩn danh" : "Nhập tên của bạn..."
                    }
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-input border border-border rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all disabled:opacity-50 text-foreground"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
                    Lời nhắn gửi đến Nghĩa
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Nhập lời chúc tốt đẹp hoặc lời nhắn của bạn tại đây..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="w-full px-4 py-3 bg-input border border-border rounded-md text-sm focus:outline-hidden focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all resize-none text-foreground"
                  />
                </div>

                {/* Tùy chọn ẩn danh */}
                <label className="inline-flex items-center gap-2.5 cursor-pointer mt-2 group select-none">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(e) => setIsAnonymous(e.target.checked)}
                    className="rounded-sm border-border text-primary focus:ring-primary bg-background w-4 h-4"
                  />
                  <span className="text-sm text-secondary group-hover:text-foreground transition-colors">
                    Ủng hộ ẩn danh (Không hiển thị tên công khai trên bảng tin)
                  </span>
                </label>
              </div>

              {/* Khu vực nút bấm & hiển thị tổng tiền */}
              <div className="mt-8 border-t border-border pt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="text-center sm:text-left">
                  <span className="text-xs text-muted-foreground block font-medium">
                    Bạn đang gửi tặng
                  </span>
                  <span className="text-2xl font-black font-mono tracking-tight text-token">
                    {amount.toLocaleString("vi-VN")}đ
                  </span>
                </div>

                <button
                  onClick={handlePayment}
                  disabled={isLoading || amount < 10000}
                  className="w-full sm:w-auto px-8 py-3.5 bg-primary text-primary-foreground font-semibold rounded-md shadow-md hover:bg-primary-glow active:scale-98 transition-all flex items-center justify-center gap-2 group animate-flicker disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span>Xác nhận đóng góp</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="w-4 h-4 text-success" />
                <span>
                  Mã VietQR được sinh tự động an toàn thông qua cổng SePay
                </span>
              </div>
            </div>

            {/* Lịch sử lời nhắn */}
            <div className="bg-surface border border-border rounded-xl p-6 shadow-md space-y-4">
              <h3 className="text-sm font-bold font-sans flex items-center gap-2 text-secondary">
                <MessageSquare className="w-4 h-4" />
                Những đóng góp gần đây
              </h3>

              <div className="space-y-3 divide-y divide-border">
                <div className="pt-3 first:pt-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">
                      Anh Hoàng Nguyễn
                    </span>
                    <span className="text-xs text-primary font-mono font-bold bg-accent-soft px-2.5 py-0.5 rounded-full">
                      +150.000đ
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    2 giờ trước
                  </p>
                  <p className="text-sm text-secondary mt-2 italic">
                    &quot;App chạy mượt lắm em ơi, cố gắng phát triển thêm nhiều tính
                    năng hay nữa nhe!&quot;
                  </p>
                </div>

                <div className="pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Một người bạn ẩn danh
                    </span>
                    <span className="text-xs text-primary font-mono font-bold bg-accent-soft px-2.5 py-0.5 rounded-full">
                      +50.000đ
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    1 ngày trước
                  </p>
                  <p className="text-sm text-secondary mt-2 italic">
                    &quot;Cảm ơn những bài viết chia sẻ kinh nghiệm làm UI/UX rất chi
                    tiết và trực quan của bạn.&quot;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
