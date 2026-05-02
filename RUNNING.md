# Proje Çalıştırma Rehberi (Arkadaşınıza Göndermek İçin)

Bu döküman, projeyi çalıştırmak ve gerekli araçları kurmak için adım adım talimatları içerir. Talimatlar Windows PowerShell için önceliklidir; diğer işletim sistemleri için verilen eşdeğer komutları kullanabilirsiniz.

## Kısa Özet
- Ne: Statik bağımlılık çıkarımı (`jdeps`), dinamik profil (Java Agent) ile çağrı verisi toplama ve React tabanlı görselleştirme.
- Önemli dosyalar: `analyzer-tool/analyzer.js`, `target-monolith` (Java projesi + `profiling-agent`), `frontend-demo` (React/Vite dashboard).

## Gereksinimler
- Java JDK 11 veya daha yeni (ya da JDK 8+); `jdeps` aracının PATH içinde olduğundan emin olun.
- Node.js 16+ (ve `npm`) — `analyzer-tool` ve `frontend-demo` için.
- Git (repo'yu klonlayacaksanız) veya proje klasörünün zip'ini açma hakkı.
- (İsteğe bağlı) Docker ve Docker Compose — konteyner olarak çalıştırmak isterseniz.

Not: Bu repo içinde Maven wrapper (`mvnw` / `mvnw.cmd`) bulunduğundan, sisteminizde Maven kurulu olmasa bile build yapabilirsiniz.

## 0) (Opsiyonel) Repo'yu alın
Eğer dosyayı Git ile almak istiyorsanız:

```bash
git clone <proje-repo-url>
cd microservice-analyzer
```

Alternatif olarak arkadaşınıza proje klasörünü zipleyip gönderebilirsiniz.

## 1) Java projesini derleyin (gerekli sınıflar + agent oluşturma)
PowerShell:'da (proje kökünde):

```powershell
cd target-monolith
.\mvnw.cmd clean package
```

Ne olur: Monolith uygulaması derlenir; `profiling-agent` modülü de paketlenir. Agent JAR'ı yer alır: `target-monolith/profiling-agent/target/jpetstore-agent.jar`.

## 2) Statik analiz (jdeps) — `dependencies.json` oluşturma
`analyzer-tool` Node betiği `jdeps` çıktısını okuyup `analyzer-tool/dependencies.json` üretir. `jdeps` için derlenmiş sınıfları gerektirir (1. adımın sonucu).

```bash
cd analyzer-tool
npm install
node analyzer.js
```

Varsa `jdeps` çıktısını test girişi olarak kullanmak isterseniz:

```bash
node analyzer.js path/to/jdeps-output.txt
```

Çıktı: `analyzer-tool/dependencies.json` (sınıf-> [bağımlı sınıflar])

## 3) Dinamik profil alma (Java Agent)
Agent, uygulama çalışırken çağrıları kaydeder ve uygulama düzgün şekilde kapatıldığında (`Ctrl+C`) `dynamic_calls.json` dosyasını yazar.

Windows PowerShell için:

```powershell
cd target-monolith
.\run-with-agent.ps1
```

Adımlar:
- Sunucuyu başlatın ve web arayüzünü (ör. http://localhost:8080/jpetstore/) gezinerek uygulamayı kullanın.
- Yeterince trafik/etkileşim oluşturduktan sonra konsolda `Ctrl+C` ile durdurun.
- Agent tarafından oluşturulan dosya: `target-monolith/dynamic_calls.json`.

Not: Eğer `run-with-agent` script'i platformunuza uygun değilse, manuel olarak `-javaagent` argümanını vererek JVM'i başlatabilirsiniz; rehberde kullanılan script'ler `target-monolith` içinde mevcuttur.

## 4) Frontend (görselleştirme) çalıştırma
Frontend demo React + Vite ile yazılmıştır. Lokal geliştirme sunucusunu çalıştırmak için:

```bash
cd frontend-demo
npm install
npm run dev
# Tarayıcıyı açın: http://localhost:5173
```

Frontend, `public/` içindeki önceden hesaplanmış JSON'ları veya `analyzer-tool/dependencies.json` ile `target-monolith/dynamic_calls.json` dosyalarını kullanarak görselleştirme yapabilir.

## 5) (İsteğe bağlı) Docker ile çalıştırma
Eğer Docker kuruluysa `target-monolith` içinde Dockerfile ve `docker-compose.yaml` bulunur. Hızlıca çalıştırmak için:

```bash
cd target-monolith
docker compose up --build
```

Bu, monolith uygulamasını konteyner içinde başlatır; agent kullanımı için Docker komutlarını agent jar'ı mount edecek şekilde düzenlemek gerekebilir.

## Önemli dosya yerleri (hızlı referans)
- Statik çıktı: `analyzer-tool/dependencies.json`
- Dinamik çıktı: `target-monolith/dynamic_calls.json`
- Agent JAR: `target-monolith/profiling-agent/target/jpetstore-agent.jar`
- Frontend: `frontend-demo/` (kaynak), önceden oluşturulmuş veriler: `frontend-demo/public/`

## Sorun Giderme
- `jdeps` bulunamadı → JDK yükleyin ve PATH'e `jdk/bin` ekleyin.
- `.\mvnw.cmd` çalışmıyorsa → PowerShell'de izin problemi olabilir; wrapper ile `mvn` kullanabilir veya `mvn` yüklü değilse sistemde Maven kurun.
- Node hata veriyorsa → `node -v` ile sürümü kontrol edin, `npm install` yapın.
- Agent `dynamic_calls.json` yazmadıysa → uygulamayı `Ctrl+C` ile düzgün kapattığınızdan emin olun; zorla kill (SIGKILL) shutdown hook'ların çalışmasını engeller.

## Ek Notlar
- Eğer arkadaşınıza sadece sonuçları (JSON'lar) göndermek isterseniz, `analyzer-tool/dependencies.json` ve `frontend-demo/public/*` veya `target-monolith/dynamic_calls.json` dosyalarını paylaşabilirsiniz.

---

İsterseniz ben bu `RUNNING.md` dosyasını repo köküne ekledim; arkadaşınıza gönderilecek hâlini gözden geçirip küçük düzenlemeler yapabilirim.
