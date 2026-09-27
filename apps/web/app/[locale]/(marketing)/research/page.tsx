import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentSection, PublicPageBody, PublicPageHeader } from "@/components/marketing/public-page";
import { Link } from "@/i18n/navigation";
import {
  evidenceSnapshotDate,
  modelEvaluation,
  platformEvidence,
  usabilityEvidence,
} from "@/lib/marketing/evidence";
import { isMarketingLocale } from "@/lib/marketing/locale";
import { publicPageSeo } from "@/lib/marketing/public-content";
import { createLocalizedMetadata } from "@/lib/seo/localized-metadata";

type PageProps = { params: Promise<{ locale: string }> };

const metricRows = [
  ["Accuracy", modelEvaluation.metrics.accuracy],
  ["Precision", modelEvaluation.metrics.precision],
  ["Recall", modelEvaluation.metrics.recall],
  ["Specificity", modelEvaluation.metrics.specificity],
  ["Balanced accuracy", modelEvaluation.metrics.balancedAccuracy],
  ["F1", modelEvaluation.metrics.f1],
] as const;

const copy = {
  en: {
    eyebrow: "Research and evaluation",
    title: "Evidence with its source and limitations attached",
    description: "Lumivox evaluates a native task-delay risk classifier and the usability of the wider product. Model metrics, usability outcomes, and platform records are reported separately because they answer different questions.",
    sections: [
      ["Problem definition", "The model estimates whether an active task is likely to become late within a 14-day prediction horizon. It supports prioritization and reflection; it does not predict grades, personal ability, or academic success."],
      ["Behavioral data pipeline", "Versioned task snapshots are derived from Lumivox task and activity records. Features are prepared under the native-task-risk-v2 schema, split by unique task into training, validation, and held-out test groups, and evaluated without treating repeated snapshots of one task as independent tasks across splits."],
      ["Task-risk model", `The selected classifier is ${modelEvaluation.algorithm}. Version ${modelEvaluation.modelVersion} is registered as deployment-ready. Logistic regression was selected to preserve a comparatively interpretable decision boundary and class balancing addresses the late-task class distribution.`],
      ["Dataset", `The model artifact records ${modelEvaluation.datasetRows.toLocaleString("en-US")} snapshots from ${modelEvaluation.uniqueTasks.toLocaleString("en-US")} unique tasks and ${modelEvaluation.uniqueUsers} users. The held-out test set contains ${modelEvaluation.testRows.toLocaleString("en-US")} snapshots across ${modelEvaluation.testTasks.toLocaleString("en-US")} tasks.`],
      ["Evaluation methodology", `The decision threshold is ${modelEvaluation.threshold}. It was chosen on validation data under constraints requiring at least 0.75 recall and 0.50 specificity while limiting the predicted-positive rate. Recall is prioritized because missing a genuinely at-risk task is considered more costly than showing an additional warning.`],
    ],
    metricsTitle: "Held-out test metrics",
    metricsIntro: "These figures describe classifier behavior on the held-out test set. They are not percentages of students who improved.",
    roc: "ROC-AUC",
    matrixTitle: "Confusion matrix",
    matrix: ["True negative", "False positive", "False negative", "True positive"],
    deploymentTitle: "Deployment validation",
    deploymentText: "The artifact passed its recorded deployment gates, including validation constraints, test-set checks, artifact serialization, feature-schema verification, and required metadata checks. Passing these gates means the artifact met the project's deployment contract; it does not remove the need for monitoring.",
    usabilityTitle: "User evaluation",
    usabilityText: "A separate usability study collected 15 responses. The standard System Usability Scale calculation produced an average SUS score of 63.5 (range 47.5 to 92.5). Across 180 task checks, 166 were marked successful, giving an aggregate task-completion rate of 92.2%. Participant names and verbatim comments are withheld because public-use consent has not been established.",
    platformTitle: "Platform snapshot",
    platformText: "As of 27 September 2026, the Supabase project contained the aggregate records below. These are database counts, not efficacy or active-user claims, and they will change as the product is used.",
    limitationsTitle: "Limitations",
    limitations: [
      "The native dataset contains 129 unique users and may not represent learners outside the current project population.",
      "A 59.50% precision and 59.97% specificity mean false-positive warnings remain a material tradeoff.",
      "The usability sample is small and the SUS average is descriptive of these 15 participants only.",
      "Offline test performance does not establish improved learning outcomes or long-term user benefit.",
    ],
    privacyTitle: "Privacy and ethical considerations",
    privacyText: "Only aggregate evaluation values are shown publicly. Predictions should be presented as assistance with uncertainty, not as judgments about a learner. The product should continue monitoring drift, false-positive burden, accessibility, and the effects of recommendations.",
  },
  vi: {
    eyebrow: "Nghiên cứu và đánh giá",
    title: "Bằng chứng luôn đi cùng nguồn và giới hạn",
    description: "Lumivox đánh giá riêng bộ phân loại rủi ro trễ nhiệm vụ native và usability của toàn sản phẩm. Metric model, kết quả usability và bản ghi nền tảng được tách biệt vì chúng trả lời các câu hỏi khác nhau.",
    sections: [
      ["Định nghĩa vấn đề", "Mô hình ước lượng một nhiệm vụ đang hoạt động có khả năng bị trễ trong 14 ngày hay không. Tín hiệu hỗ trợ ưu tiên và phản tư; nó không dự đoán điểm số, năng lực cá nhân hay thành công học tập."],
      ["Pipeline dữ liệu hành vi", "Các snapshot nhiệm vụ có phiên bản được tạo từ bản ghi nhiệm vụ và hoạt động Lumivox. Feature được chuẩn bị theo schema native-task-risk-v2, chia theo nhiệm vụ duy nhất thành train, validation và test độc lập, tránh coi các snapshot lặp của cùng nhiệm vụ là nhiệm vụ độc lập ở nhiều tập."],
      ["Mô hình rủi ro nhiệm vụ", `Bộ phân loại được chọn là ${modelEvaluation.algorithm}. Phiên bản ${modelEvaluation.modelVersion} được đăng ký ở trạng thái sẵn sàng triển khai. Logistic regression giữ ranh giới quyết định tương đối dễ diễn giải, còn class balancing xử lý phân bố của lớp nhiệm vụ trễ.`],
      ["Dữ liệu", `Artifact ghi nhận ${modelEvaluation.datasetRows.toLocaleString("vi-VN")} snapshot từ ${modelEvaluation.uniqueTasks.toLocaleString("vi-VN")} nhiệm vụ duy nhất và ${modelEvaluation.uniqueUsers} người dùng. Tập test độc lập có ${modelEvaluation.testRows.toLocaleString("vi-VN")} snapshot thuộc ${modelEvaluation.testTasks.toLocaleString("vi-VN")} nhiệm vụ.`],
      ["Phương pháp đánh giá", `Ngưỡng quyết định là ${modelEvaluation.threshold}. Ngưỡng được chọn trên validation với ràng buộc recall tối thiểu 0.75, specificity tối thiểu 0.50 và giới hạn tỷ lệ dự đoán dương. Recall được ưu tiên vì bỏ sót nhiệm vụ thật sự có rủi ro được xem là tốn kém hơn một cảnh báo bổ sung.`],
    ],
    metricsTitle: "Chỉ số trên tập test độc lập",
    metricsIntro: "Các số này mô tả hành vi bộ phân loại trên tập test. Chúng không phải tỷ lệ sinh viên cải thiện.",
    roc: "ROC-AUC",
    matrixTitle: "Ma trận nhầm lẫn",
    matrix: ["Âm tính đúng", "Dương tính giả", "Âm tính giả", "Dương tính đúng"],
    deploymentTitle: "Kiểm tra triển khai",
    deploymentText: "Artifact đã vượt qua các gate triển khai được ghi nhận, gồm ràng buộc validation, kiểm tra test set, serialization artifact, xác minh feature schema và metadata bắt buộc. Vượt gate nghĩa là artifact đáp ứng deployment contract của dự án, không loại bỏ nhu cầu monitoring.",
    usabilityTitle: "Đánh giá người dùng",
    usabilityText: "Một nghiên cứu usability riêng thu 15 phản hồi. Công thức System Usability Scale chuẩn cho SUS trung bình 63.5 (khoảng 47.5 đến 92.5). Trong 180 lượt kiểm tra tác vụ, 166 lượt thành công, tương đương tỷ lệ hoàn thành tổng hợp 92.2%. Tên và nhận xét nguyên văn không được công bố vì chưa xác lập consent sử dụng công khai.",
    platformTitle: "Snapshot nền tảng",
    platformText: "Tại ngày 27/09/2026, dự án Supabase có các bản ghi tổng hợp bên dưới. Đây là số đếm database, không phải claim về hiệu quả hay người dùng hoạt động, và sẽ thay đổi khi sản phẩm được sử dụng.",
    limitationsTitle: "Giới hạn",
    limitations: [
      "Dataset native có 129 người dùng duy nhất và có thể chưa đại diện cho người học ngoài nhóm hiện tại.",
      "Precision 59.50% và specificity 59.97% cho thấy cảnh báo dương tính giả vẫn là tradeoff đáng kể.",
      "Mẫu usability nhỏ và SUS trung bình chỉ mô tả 15 participant này.",
      "Hiệu năng test offline không chứng minh kết quả học tập hoặc lợi ích dài hạn được cải thiện.",
    ],
    privacyTitle: "Quyền riêng tư và đạo đức",
    privacyText: "Website chỉ công bố giá trị đánh giá tổng hợp. Dự đoán cần được trình bày như hỗ trợ có bất định, không phải phán xét người học. Sản phẩm cần tiếp tục theo dõi drift, gánh nặng dương tính giả, accessibility và tác động của gợi ý.",
  },
} as const;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  return createLocalizedMetadata({ locale, pathname: "/research", ...publicPageSeo[locale].research });
}

export default async function ResearchPage({ params }: PageProps) {
  const { locale } = await params;
  if (!isMarketingLocale(locale)) notFound();
  const t = copy[locale];
  const localeCode = locale === "en" ? "en-US" : "vi-VN";

  const matrixValues = Object.values(modelEvaluation.confusionMatrix);
  const platformRows = [
    [locale === "en" ? "Profile records" : "Bản ghi hồ sơ", platformEvidence.profileRecords],
    [locale === "en" ? "Task records" : "Bản ghi nhiệm vụ", platformEvidence.taskRecords],
    [locale === "en" ? "Goal records" : "Bản ghi mục tiêu", platformEvidence.goalRecords],
    [locale === "en" ? "Focus-session records" : "Bản ghi phiên tập trung", platformEvidence.focusSessionRecords],
  ] as const;

  return (
    <>
      <PublicPageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />
      <PublicPageBody>
        {t.sections.map(([title, paragraph], index) => (
          <ContentSection key={title} number={`0${index + 1}`} title={title}><p>{paragraph}</p></ContentSection>
        ))}

        <p className="border-b border-border py-6 text-[13px] text-secondary">
          <Link href="/features" className="font-medium text-primary underline underline-offset-4">
            {locale === "en" ? "See task-risk prediction in the product context" : "Xem dự đoán rủi ro nhiệm vụ trong ngữ cảnh sản phẩm"}
          </Link>
        </p>

        <ContentSection number="06" title={t.metricsTitle}>
          <p>{t.metricsIntro}</p>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full text-left text-[13px]">
              <tbody className="divide-y divide-border">
                {metricRows.map(([label, value]) => (
                  <tr key={label}><th className="px-4 py-3 font-medium text-foreground">{label}</th><td className="px-4 py-3 text-right font-mono">{(value * 100).toFixed(2)}%</td></tr>
                ))}
                <tr><th className="px-4 py-3 font-medium text-foreground">{t.roc}</th><td className="px-4 py-3 text-right font-mono">{modelEvaluation.metrics.rocAuc.toFixed(4)}</td></tr>
              </tbody>
            </table>
          </div>
          <h3 className="pt-2 text-[15px] font-semibold text-foreground">{t.matrixTitle}</h3>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {t.matrix.map((label, index) => <div key={label} className="bg-surface p-4"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-[18px] text-foreground">{matrixValues[index].toLocaleString(localeCode)}</dd></div>)}
          </dl>
        </ContentSection>

        <ContentSection number="07" title={t.deploymentTitle}><p>{t.deploymentText}</p></ContentSection>
        <ContentSection number="08" title={t.usabilityTitle}>
          <p>{t.usabilityText}</p>
          <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-border bg-border text-center">
            <div className="bg-surface p-4"><dt className="text-[11px] text-muted-foreground">{locale === "en" ? "Participants" : "Participant"}</dt><dd className="mt-1 text-[22px] font-semibold text-foreground">{usabilityEvidence.participants}</dd></div>
            <div className="bg-surface p-4"><dt className="text-[11px] text-muted-foreground">{locale === "en" ? "Average SUS" : "SUS trung bình"}</dt><dd className="mt-1 text-[22px] font-semibold text-foreground">{usabilityEvidence.averageSus}</dd></div>
            <div className="bg-surface p-4"><dt className="text-[11px] text-muted-foreground">{locale === "en" ? "Task completion" : "Hoàn thành tác vụ"}</dt><dd className="mt-1 text-[22px] font-semibold text-foreground">{(usabilityEvidence.taskCompletionRate * 100).toFixed(1)}%</dd></div>
          </dl>
        </ContentSection>

        <ContentSection number="09" title={t.platformTitle}>
          <p>{t.platformText}</p>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border">
            {platformRows.map(([label, value]) => <div key={label} className="bg-surface p-4"><dt className="text-[11px] text-muted-foreground">{label}</dt><dd className="mt-1 font-mono text-[18px] text-foreground">{value.toLocaleString(localeCode)}</dd></div>)}
          </dl>
          <p className="text-[12px] text-muted-foreground">Snapshot: {evidenceSnapshotDate}</p>
        </ContentSection>

        <ContentSection number="10" title={t.limitationsTitle}><ul className="space-y-2">{t.limitations.map((item) => <li key={item}>• {item}</li>)}</ul></ContentSection>
        <ContentSection number="11" title={t.privacyTitle}>
          <p>{t.privacyText}</p>
          <p><Link href="/privacy" className="font-medium text-primary underline underline-offset-4">{locale === "en" ? "Read the privacy and data-use details" : "Đọc chi tiết quyền riêng tư và sử dụng dữ liệu"}</Link></p>
        </ContentSection>
      </PublicPageBody>
    </>
  );
}
