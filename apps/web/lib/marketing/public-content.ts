export type MarketingLocale = "en" | "vi";

export const publicPageSeo = {
  en: {
    home: {
      title: "AI Study Planner & Focus Analytics",
      description:
        "Plan tasks, improve focus, understand study habits, and receive personalized AI-assisted learning recommendations with Lumivox.",
    },
    about: {
      title: "About Lumivox",
      description:
        "Learn why Lumivox combines study planning, behavioral analytics, and explainable AI in a bilingual learning workspace.",
    },
    features: {
      title: "Study Planning, Focus & AI Features",
      description:
        "Explore Lumivox features for goals, tasks, focus sessions, behavioral analytics, task-risk prediction, study rooms, roadmaps, and document-grounded AI.",
    },
    research: {
      title: "Research & Model Evaluation",
      description:
        "Review the Lumivox task-delay risk methodology, dataset, held-out test metrics, usability study, deployment checks, limitations, and privacy considerations.",
    },
    privacy: {
      title: "Privacy & Data Use",
      description:
        "Understand what data Lumivox processes, why it is used, how AI providers are involved, and how users can manage their information.",
    },
    terms: {
      title: "Terms of Use",
      description:
        "Read the terms that govern educational and productivity use of Lumivox, including AI limitations, acceptable use, and account responsibilities.",
    },
    contact: {
      title: "Contact the Lumivox Project",
      description:
        "Contact the Lumivox project team, report a technical issue, or share feedback about the study and productivity platform.",
    },
  },
  vi: {
    home: {
      title: "Ứng dụng học tập AI & quản lý tập trung",
      description:
        "Quản lý nhiệm vụ, cải thiện tập trung, hiểu thói quen học tập và nhận gợi ý cá nhân hóa có AI hỗ trợ cùng Lumivox.",
    },
    about: {
      title: "Giới thiệu Lumivox",
      description:
        "Tìm hiểu vì sao Lumivox kết hợp lập kế hoạch học tập, phân tích hành vi và AI có thể giải thích trong một không gian song ngữ.",
    },
    features: {
      title: "Tính năng lập kế hoạch, tập trung và AI",
      description:
        "Khám phá các tính năng mục tiêu, nhiệm vụ, phiên tập trung, phân tích hành vi, dự đoán rủi ro trễ hạn, phòng học, lộ trình và AI dựa trên tài liệu.",
    },
    research: {
      title: "Nghiên cứu & đánh giá mô hình",
      description:
        "Xem phương pháp dự đoán rủi ro trễ nhiệm vụ, dữ liệu, chỉ số test độc lập, nghiên cứu usability, kiểm tra triển khai, giới hạn và quyền riêng tư của Lumivox.",
    },
    privacy: {
      title: "Quyền riêng tư & sử dụng dữ liệu",
      description:
        "Hiểu dữ liệu Lumivox xử lý, mục đích sử dụng, vai trò của nhà cung cấp AI và cách người dùng quản lý thông tin.",
    },
    terms: {
      title: "Điều khoản sử dụng",
      description:
        "Đọc điều khoản sử dụng Lumivox cho mục đích học tập và năng suất, gồm giới hạn AI, sử dụng chấp nhận được và trách nhiệm tài khoản.",
    },
    contact: {
      title: "Liên hệ dự án Lumivox",
      description:
        "Liên hệ nhóm dự án Lumivox, báo lỗi kỹ thuật hoặc gửi phản hồi về nền tảng học tập và năng suất.",
    },
  },
} as const;

export const aboutContent = {
  en: {
    eyebrow: "About the project",
    title: "A study workspace built around measurable behavior",
    description:
      "Lumivox is a bilingual study and productivity platform created as a final-year university project. It brings planning, focused work, reflection, and AI-assisted guidance into one connected system.",
    sections: [
      {
        title: "What Lumivox is",
        paragraphs: [
          "Lumivox helps learners turn goals into tasks, complete focused study sessions, and review the behavioral patterns created by that work. The product is designed for students, independent learners, and knowledge workers who need more than a static to-do list.",
          "Its central idea is simple: productivity tools become more useful when they explain patterns instead of only counting activity. Lumivox connects task completion, deadline behavior, focus time, distractions, and reflection so users can see how their routine changes over time.",
        ],
      },
      {
        title: "The problem",
        paragraphs: [
          "Traditional planners are good at recording intention but often stop there. A completed checkbox says what happened, but it does not explain whether a workload was realistic, when concentration was strongest, or which tasks were repeatedly delayed.",
          "Lumivox addresses that gap with behavioral analytics and contextual recommendations. The aim is not to automate personal judgment. It is to give learners clearer evidence for deciding what to work on next and how to adjust a study routine.",
        ],
      },
      {
        title: "Approach and audience",
        paragraphs: [
          "The platform combines goal-linked tasks, focus sessions, weekly reflections, study rooms, learning roadmaps, and document-grounded AI. A native task-risk model estimates the likelihood that a task may be late within a 14-day horizon and presents that signal as decision support.",
          "The experience is intended for people who want structure without aggressive productivity pressure. English and Vietnamese interfaces make the same core workflow available to both language groups.",
        ],
      },
      {
        title: "Project origin and design philosophy",
        paragraphs: [
          "Lumivox began as a final-year project exploring how behavioral data and machine learning can support self-regulated learning. The project treats implementation, model evaluation, usability testing, and transparent communication as parts of the same product problem.",
          "The design principle is calm intelligence: recommendations should be understandable, evidence should be labeled by its real source, and the interface should help users act without overstating what the system knows.",
        ],
      },
      {
        title: "Technology",
        paragraphs: [
          "The web application uses Next.js and React, with Supabase for authentication and relational data. AI services are implemented with FastAPI. The task-risk classifier is evaluated from a versioned artifact and registered model metadata, while generative features use configured external AI providers where needed.",
          "This public site documents the product capabilities, research methodology, privacy model, and current limitations so the project can be assessed as a working system rather than a collection of marketing claims.",
        ],
      },
    ],
  },
  vi: {
    eyebrow: "Giới thiệu dự án",
    title: "Không gian học tập xây dựng quanh hành vi có thể đo lường",
    description:
      "Lumivox là nền tảng học tập và năng suất song ngữ được phát triển trong khuôn khổ đồ án tốt nghiệp. Sản phẩm kết nối lập kế hoạch, tập trung, phản tư và hỗ trợ từ AI trong một hệ thống thống nhất.",
    sections: [
      {
        title: "Lumivox là gì",
        paragraphs: [
          "Lumivox giúp người học chuyển mục tiêu thành nhiệm vụ, hoàn thành các phiên học tập trung và xem lại những mô thức hành vi hình thành trong quá trình đó. Sản phẩm dành cho sinh viên, người tự học và người làm công việc tri thức cần nhiều hơn một danh sách việc cần làm tĩnh.",
          "Ý tưởng trung tâm là công cụ năng suất sẽ hữu ích hơn khi giải thích mô thức thay vì chỉ đếm hoạt động. Lumivox liên kết việc hoàn thành nhiệm vụ, hành vi deadline, thời gian tập trung, xao nhãng và phản tư để người dùng quan sát thói quen thay đổi theo thời gian.",
        ],
      },
      {
        title: "Vấn đề",
        paragraphs: [
          "Công cụ lập kế hoạch truyền thống ghi lại ý định khá tốt nhưng thường dừng ở đó. Một ô đã đánh dấu cho biết điều gì xảy ra, nhưng không giải thích khối lượng công việc có thực tế hay không, lúc nào khả năng tập trung tốt nhất hoặc nhiệm vụ nào thường xuyên bị trễ.",
          "Lumivox tiếp cận khoảng trống này bằng phân tích hành vi và gợi ý theo ngữ cảnh. Mục tiêu không phải thay thế phán đoán cá nhân, mà là cung cấp bằng chứng rõ hơn để người học chọn việc tiếp theo và điều chỉnh thói quen.",
        ],
      },
      {
        title: "Cách tiếp cận và người dùng",
        paragraphs: [
          "Nền tảng kết hợp nhiệm vụ gắn với mục tiêu, phiên tập trung, phản tư tuần, phòng học, lộ trình học và AI dựa trên tài liệu. Mô hình rủi ro nhiệm vụ nội bộ ước lượng khả năng một nhiệm vụ bị trễ trong 14 ngày và trình bày tín hiệu đó như thông tin hỗ trợ quyết định.",
          "Trải nghiệm hướng đến người cần cấu trúc nhưng không muốn áp lực năng suất quá mức. Giao diện tiếng Anh và tiếng Việt cùng cung cấp một quy trình cốt lõi nhất quán.",
        ],
      },
      {
        title: "Nguồn gốc và triết lý thiết kế",
        paragraphs: [
          "Lumivox bắt đầu như một đồ án tốt nghiệp nghiên cứu cách dữ liệu hành vi và machine learning có thể hỗ trợ việc học tự điều chỉnh. Dự án xem triển khai, đánh giá mô hình, kiểm thử usability và truyền đạt minh bạch là các phần của cùng một bài toán sản phẩm.",
          "Nguyên tắc thiết kế là trí tuệ dịu nhẹ: gợi ý cần dễ hiểu, bằng chứng phải ghi đúng nguồn và giao diện cần giúp người dùng hành động mà không phóng đại điều hệ thống biết.",
        ],
      },
      {
        title: "Công nghệ",
        paragraphs: [
          "Ứng dụng web sử dụng Next.js và React, cùng Supabase cho xác thực và dữ liệu quan hệ. Dịch vụ AI được triển khai bằng FastAPI. Bộ phân loại rủi ro nhiệm vụ được đánh giá từ artifact có phiên bản và metadata model registry; các tính năng tạo sinh dùng nhà cung cấp AI bên ngoài đã cấu hình khi cần.",
          "Website public này ghi lại năng lực sản phẩm, phương pháp nghiên cứu, mô hình quyền riêng tư và các giới hạn hiện tại để dự án được đánh giá như một hệ thống hoạt động thực tế thay vì một tập hợp claim marketing.",
        ],
      },
    ],
  },
} as const;

export const featureContent = {
  en: {
    eyebrow: "Product capabilities",
    title: "One workflow from intention to reflection",
    description:
      "Each capability contributes to a shared behavioral picture. Features are designed to work together while keeping users in control of their study decisions.",
    items: [
      ["Goal and task planning", "Break learning objectives into dated, prioritized tasks. Link work to short- or long-term goals so progress retains its context."],
      ["Focus sessions", "Run structured focus sessions, record actual focused time and distractions, and use that history to understand working patterns."],
      ["Behavioral analytics", "Review task completion, deadline adherence, consistency, and focus quality through a Personal Behavior Index and interpretable component-level signals."],
      ["AI recommendations", "Receive contextual suggestions and weekly reflections based on recorded activity. Recommendations are support for judgment, not guarantees or professional advice."],
      ["Task-risk prediction", "Estimate whether an active task may be late within a 14-day horizon. The current native model uses a documented 0.4 decision threshold and exposes explanation metadata."],
      ["Learning roadmaps", "Generate an editable study roadmap, review its goals and tasks, and decide whether to apply it to the workspace."],
      ["Study rooms", "Create or join study spaces with presence, text chat, voice participation, group membership, and shared weekly challenges."],
      ["Documents and grounded AI", "Upload learning documents, process them into searchable chunks, and ask questions with retrieved sources when document context is selected."],
      ["Reflections and engagement", "Use weekly reflection, streaks, tokens, and progress snapshots as feedback mechanisms. These signals encourage continuity without claiming academic outcomes."],
    ],
  },
  vi: {
    eyebrow: "Năng lực sản phẩm",
    title: "Một quy trình từ ý định đến phản tư",
    description:
      "Mỗi năng lực đóng góp vào một bức tranh hành vi chung. Các tính năng phối hợp với nhau nhưng vẫn để người dùng quyết định cách học của mình.",
    items: [
      ["Mục tiêu và nhiệm vụ", "Chia mục tiêu học tập thành nhiệm vụ có ngày, mức ưu tiên và liên kết với mục tiêu ngắn hoặc dài hạn để tiến độ luôn có ngữ cảnh."],
      ["Phiên tập trung", "Thực hiện phiên tập trung có cấu trúc, ghi lại thời gian tập trung thực tế và xao nhãng, rồi dùng lịch sử đó để hiểu mô thức làm việc."],
      ["Phân tích hành vi", "Xem mức hoàn thành nhiệm vụ, tuân thủ deadline, độ đều đặn và chất lượng tập trung qua Chỉ số Hành vi Cá nhân cùng các tín hiệu có thể giải thích."],
      ["Gợi ý từ AI", "Nhận gợi ý theo ngữ cảnh và phản tư tuần dựa trên hoạt động đã ghi. Gợi ý hỗ trợ phán đoán, không phải bảo đảm hay tư vấn chuyên môn."],
      ["Dự đoán rủi ro nhiệm vụ", "Ước lượng nhiệm vụ đang hoạt động có thể bị trễ trong 14 ngày hay không. Mô hình native hiện tại dùng ngưỡng 0.4 đã ghi tài liệu và cung cấp metadata giải thích."],
      ["Lộ trình học tập", "Tạo lộ trình có thể chỉnh sửa, xem lại mục tiêu và nhiệm vụ, sau đó tự quyết định có áp dụng vào workspace hay không."],
      ["Phòng học", "Tạo hoặc tham gia không gian học với hiện diện, chat văn bản, voice, thành viên nhóm và thử thách tuần chung."],
      ["Tài liệu và AI có nguồn", "Tải tài liệu học, xử lý thành các đoạn có thể tìm kiếm và đặt câu hỏi kèm nguồn truy xuất khi chọn ngữ cảnh tài liệu."],
      ["Phản tư và duy trì", "Dùng phản tư tuần, streak, token và snapshot tiến độ như cơ chế phản hồi. Các tín hiệu khuyến khích tính liên tục nhưng không claim kết quả học tập."],
    ],
  },
} as const;

export const privacyContent = {
  en: {
    eyebrow: "Privacy and data use",
    title: "Clear context for behavioral and AI data",
    description:
      "Lumivox processes study activity to provide its core workspace, analytics, and AI-assisted features. This page describes the current project implementation; it is not a claim that no third party ever processes data.",
    sections: [
      ["Account data", "Authentication and profile records identify your account, preferred language, onboarding state, and product settings. Supabase provides authentication and database infrastructure. These records are used to secure access and personalize the workspace."],
      ["Tasks, goals, and focus behavior", "Task titles, descriptions, priorities, dates, completion state, goals, focus-session duration, and recorded distractions support planning and behavioral analytics. They may also form input features for task-risk assessment and weekly reflection."],
      ["Study-room interactions", "Room membership, presence, text messages, voice-room connection metadata, reactions, and challenge progress are processed to provide collaborative study features. Other room participants can see information that the interface presents as shared."],
      ["Uploaded documents", "Files that you upload are stored for document features. Extracted text can be divided into chunks and represented as embeddings so selected documents can be searched during grounded AI conversations. Only upload material you are permitted to use."],
      ["AI request context", "When you request an AI insight, roadmap, translation, reflection, or document-grounded answer, relevant prompt text and selected context may be sent through the Lumivox AI service to configured external model providers. The current service supports Google Gemini and Groq-backed generation paths; document embeddings use Google Gemini."],
      ["Storage and access controls", "Application records are stored in Supabase. Public-schema tables use row-level security so application requests are scoped by the relevant ownership and access policies. Secret backend credentials are not shipped to the browser; the web client uses a publishable key."],
      ["Managing your information", "You can edit or remove many workspace records through their product controls. Account-level export and deletion are not currently presented as a self-service control in this codebase. For requests that cannot be completed in the interface, contact the project through the public repository and avoid posting private data in a public issue."],
      ["Research reporting", "Public research pages use aggregate metrics. Participant names and verbatim usability comments are not published without explicit consent. Model evaluation statistics describe classifier performance and do not represent improvements in student outcomes."],
    ],
    updated: "Implementation reviewed: 27 September 2026",
  },
  vi: {
    eyebrow: "Quyền riêng tư và dữ liệu",
    title: "Ngữ cảnh rõ ràng cho dữ liệu hành vi và AI",
    description:
      "Lumivox xử lý hoạt động học để cung cấp workspace, phân tích và tính năng có AI hỗ trợ. Trang này mô tả implementation hiện tại của dự án; đây không phải claim rằng không có bên thứ ba nào xử lý dữ liệu.",
    sections: [
      ["Dữ liệu tài khoản", "Bản ghi xác thực và hồ sơ nhận diện tài khoản, ngôn ngữ, trạng thái onboarding và cài đặt sản phẩm. Supabase cung cấp hạ tầng xác thực và cơ sở dữ liệu. Các bản ghi này được dùng để bảo vệ truy cập và cá nhân hóa workspace."],
      ["Nhiệm vụ, mục tiêu và hành vi tập trung", "Tiêu đề, mô tả, ưu tiên, ngày, trạng thái nhiệm vụ, mục tiêu, thời lượng tập trung và xao nhãng đã ghi hỗ trợ lập kế hoạch và phân tích hành vi. Chúng cũng có thể trở thành feature đầu vào cho đánh giá rủi ro nhiệm vụ và phản tư tuần."],
      ["Tương tác trong phòng học", "Thành viên, hiện diện, tin nhắn, metadata kết nối voice, reaction và tiến độ thử thách được xử lý để cung cấp tính năng học cộng tác. Người cùng phòng có thể thấy thông tin mà giao diện xác định là được chia sẻ."],
      ["Tài liệu tải lên", "Tệp người dùng tải lên được lưu cho tính năng tài liệu. Văn bản trích xuất có thể được chia thành chunk và biểu diễn bằng embedding để tìm kiếm trong hội thoại AI có nguồn. Chỉ tải lên nội dung bạn có quyền sử dụng."],
      ["Ngữ cảnh yêu cầu AI", "Khi yêu cầu insight, lộ trình, bản dịch, phản tư hoặc câu trả lời dựa trên tài liệu, prompt và ngữ cảnh liên quan có thể đi qua dịch vụ AI của Lumivox đến nhà cung cấp model bên ngoài đã cấu hình. Dịch vụ hiện hỗ trợ luồng tạo sinh Google Gemini và Groq; embedding tài liệu dùng Google Gemini."],
      ["Lưu trữ và kiểm soát truy cập", "Bản ghi ứng dụng được lưu trên Supabase. Các bảng trong public schema dùng row-level security để request ứng dụng bị giới hạn theo policy sở hữu và quyền truy cập tương ứng. Secret backend không được gửi đến trình duyệt; web client dùng publishable key."],
      ["Quản lý thông tin", "Bạn có thể sửa hoặc xóa nhiều bản ghi workspace qua control trong sản phẩm. Export và xóa toàn bộ tài khoản hiện chưa xuất hiện như control tự phục vụ trong codebase. Với yêu cầu không thể thực hiện trong giao diện, hãy liên hệ qua repository công khai và không đăng dữ liệu riêng tư trong issue public."],
      ["Báo cáo nghiên cứu", "Trang nghiên cứu public chỉ dùng chỉ số tổng hợp. Tên và nhận xét nguyên văn của participant không được công bố khi chưa có consent rõ ràng. Chỉ số model mô tả hiệu năng bộ phân loại, không đại diện cho mức cải thiện kết quả học tập."],
    ],
    updated: "Rà soát implementation: 27 tháng 9 năm 2026",
  },
} as const;

export const termsContent = {
  en: {
    eyebrow: "Terms of use",
    title: "Using Lumivox responsibly",
    description:
      "These project terms set practical expectations for using Lumivox. They are a plain-language project policy and are not a substitute for jurisdiction-specific legal advice.",
    sections: [
      ["Educational and productivity purpose", "Lumivox is provided as a study and productivity tool. It does not provide medical, psychological, legal, financial, or academic-guarantee services. You remain responsible for study choices, deadlines, submitted work, and decisions made from product output."],
      ["AI and prediction limitations", "AI-generated recommendations, summaries, roadmaps, translations, and risk estimates may be incomplete or wrong. A task-risk warning is a probabilistic signal, not a fact. Review outputs before relying on them and do not use Lumivox as the sole basis for high-impact decisions."],
      ["Account security", "Provide accurate account information, keep credentials confidential, and notify the project if you believe your account is compromised. You are responsible for activity performed through your account unless applicable rules require otherwise."],
      ["Acceptable use", "Do not use Lumivox to violate law, harm others, attempt unauthorized access, disrupt the service, distribute malicious content, scrape private information, or abuse AI and collaboration features. Access may be limited when necessary to protect the project and its users."],
      ["Uploaded content", "You retain responsibility for documents and messages you provide. You must have the right to upload and process that material. Do not upload confidential, infringing, or sensitive content unless you understand the processing described in the privacy page."],
      ["Intellectual property", "The Lumivox name, interface, source materials, and project documentation remain subject to their respective ownership and repository license terms. These terms do not transfer ownership of user-provided content to other users."],
      ["Availability and changes", "Lumivox is an evolving university project. Features, models, providers, limits, and availability may change, and uninterrupted service is not guaranteed. Material changes to public terms or data practices should be reflected on these pages."],
      ["Contact and interpretation", "Questions and technical reports can be submitted through the project repository. If a translated version differs in meaning, the project team should clarify the intended policy rather than silently relying on an ambiguous interpretation."],
    ],
    updated: "Effective: 27 September 2026",
  },
  vi: {
    eyebrow: "Điều khoản sử dụng",
    title: "Sử dụng Lumivox có trách nhiệm",
    description:
      "Các điều khoản dự án này đặt kỳ vọng thực tế khi dùng Lumivox. Đây là chính sách dự án bằng ngôn ngữ dễ hiểu, không thay thế tư vấn pháp lý theo từng khu vực pháp lý.",
    sections: [
      ["Mục đích học tập và năng suất", "Lumivox được cung cấp như công cụ học tập và năng suất. Sản phẩm không cung cấp dịch vụ y tế, tâm lý, pháp lý, tài chính hoặc bảo đảm kết quả học tập. Bạn vẫn chịu trách nhiệm với lựa chọn học, deadline, bài nộp và quyết định dựa trên output sản phẩm."],
      ["Giới hạn của AI và dự đoán", "Gợi ý, tóm tắt, lộ trình, bản dịch và ước lượng rủi ro do AI tạo có thể thiếu hoặc sai. Cảnh báo rủi ro nhiệm vụ là tín hiệu xác suất, không phải sự thật chắc chắn. Hãy kiểm tra output và không dùng Lumivox làm cơ sở duy nhất cho quyết định có ảnh hưởng lớn."],
      ["Bảo mật tài khoản", "Cung cấp thông tin tài khoản chính xác, giữ bí mật thông tin đăng nhập và thông báo cho dự án nếu nghi ngờ tài khoản bị xâm phạm. Bạn chịu trách nhiệm với hoạt động qua tài khoản trừ khi quy định áp dụng yêu cầu khác."],
      ["Sử dụng chấp nhận được", "Không dùng Lumivox để vi phạm pháp luật, gây hại, truy cập trái phép, làm gián đoạn dịch vụ, phát tán nội dung độc hại, thu thập dữ liệu riêng tư hoặc lạm dụng tính năng AI và cộng tác. Quyền truy cập có thể bị giới hạn để bảo vệ dự án và người dùng."],
      ["Nội dung tải lên", "Bạn chịu trách nhiệm với tài liệu và tin nhắn mình cung cấp, đồng thời phải có quyền tải lên và xử lý nội dung đó. Không tải nội dung bí mật, vi phạm bản quyền hoặc nhạy cảm nếu chưa hiểu cách xử lý mô tả tại trang quyền riêng tư."],
      ["Sở hữu trí tuệ", "Tên Lumivox, giao diện, tài liệu nguồn và tài liệu dự án tuân theo quyền sở hữu và license repository tương ứng. Điều khoản này không chuyển quyền sở hữu nội dung người dùng cung cấp cho người dùng khác."],
      ["Tính sẵn sàng và thay đổi", "Lumivox là đồ án đại học đang phát triển. Tính năng, model, provider, giới hạn và khả năng hoạt động có thể thay đổi; dịch vụ liên tục không được bảo đảm. Thay đổi quan trọng về điều khoản hoặc dữ liệu cần được phản ánh trên các trang public này."],
      ["Liên hệ và diễn giải", "Câu hỏi và báo cáo kỹ thuật có thể gửi qua repository dự án. Nếu bản dịch có khác biệt về nghĩa, nhóm dự án cần làm rõ chính sách dự kiến thay vì âm thầm dựa vào cách diễn giải mơ hồ."],
    ],
    updated: "Có hiệu lực: 27 tháng 9 năm 2026",
  },
} as const;

export const contactContent = {
  en: {
    eyebrow: "Project contact",
    title: "Questions, feedback, and technical reports",
    description:
      "Lumivox is a university project. The public repository is the current verified contact channel for technical issues and project feedback.",
    issueTitle: "Open a GitHub issue",
    issueDescription:
      "Use an issue for reproducible bugs, accessibility problems, documentation corrections, or feature feedback. Do not include passwords, private study data, uploaded documents, API keys, or other sensitive information.",
    issueCta: "Visit the project repository",
    privacyTitle: "Privacy or account requests",
    privacyDescription:
      "For a request involving personal data, first provide only a non-sensitive summary through the repository and ask for a private follow-up channel. Never post identifying records in a public issue.",
    responseTitle: "What helps us respond",
    responseItems: [
      "The page or feature involved",
      "What you expected and what happened",
      "Browser and device information when relevant",
      "Steps that reproduce the issue without exposing private data",
    ],
  },
  vi: {
    eyebrow: "Liên hệ dự án",
    title: "Câu hỏi, phản hồi và báo cáo kỹ thuật",
    description:
      "Lumivox là một đồ án đại học. Repository công khai là kênh liên hệ đã được xác minh hiện tại cho lỗi kỹ thuật và phản hồi dự án.",
    issueTitle: "Tạo GitHub issue",
    issueDescription:
      "Dùng issue cho bug có thể tái hiện, vấn đề accessibility, chỉnh sửa tài liệu hoặc góp ý tính năng. Không đưa mật khẩu, dữ liệu học riêng tư, tài liệu đã tải lên, API key hoặc thông tin nhạy cảm vào issue.",
    issueCta: "Mở repository dự án",
    privacyTitle: "Yêu cầu về quyền riêng tư hoặc tài khoản",
    privacyDescription:
      "Với yêu cầu liên quan dữ liệu cá nhân, trước tiên chỉ cung cấp mô tả không nhạy cảm qua repository và đề nghị kênh trao đổi riêng. Không đăng bản ghi có thể nhận diện trong issue public.",
    responseTitle: "Thông tin giúp nhóm phản hồi",
    responseItems: [
      "Trang hoặc tính năng liên quan",
      "Điều bạn mong đợi và điều đã xảy ra",
      "Thông tin trình duyệt và thiết bị khi cần",
      "Các bước tái hiện lỗi mà không lộ dữ liệu riêng tư",
    ],
  },
} as const;
