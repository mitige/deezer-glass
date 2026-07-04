#![deny(clippy::all)]
use base64::Engine;
use napi::threadsafe_function::{ErrorStrategy, ThreadsafeFunction, ThreadsafeFunctionCallMode};
use napi::JsFunction;
use napi_derive::napi;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use windows::Foundation::{EventRegistrationToken, TypedEventHandler};
use windows::Media::Control::{
  GlobalSystemMediaTransportControlsSession as Session,
  GlobalSystemMediaTransportControlsSessionManager as SessionManager,
  GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
};
use windows::Storage::Streams::{DataReader, InputStreamOptions};
use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

type Tsfn = ThreadsafeFunction<NowPlaying, ErrorStrategy::Fatal>;

#[napi(object)]
pub struct NowPlaying {
  pub title: String,
  pub artist: String,
  pub album: String,
  pub art_data_url: Option<String>,
  pub position_ms: f64,
  pub duration_ms: f64,
  pub last_updated_ms: f64,
  pub rate: f64,
  pub status: String,
}

static RUNNING: AtomicBool = AtomicBool::new(false);

#[napi]
pub fn start(callback: JsFunction) -> napi::Result<()> {
  let tsfn: Tsfn = callback.create_threadsafe_function(0, |ctx| Ok(vec![ctx.value]))?;
  RUNNING.store(true, Ordering::SeqCst);
  std::thread::spawn(move || {
    unsafe {
      let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
    if let Err(e) = run(tsfn) {
      eprintln!("[smtc] fatal: {e:?}");
    }
  });
  Ok(())
}

#[napi]
pub fn stop() {
  RUNNING.store(false, Ordering::SeqCst);
}

fn run(tsfn: Tsfn) -> windows::core::Result<()> {
  let manager = SessionManager::RequestAsync()?.get()?;
  let hooked: Arc<Mutex<Option<(Session, Vec<EventRegistrationToken>)>>> = Arc::new(Mutex::new(None));

  let rehook = {
    let hooked = hooked.clone();
    let tsfn = tsfn.clone();
    move |mgr: &SessionManager| -> windows::core::Result<()> {
      let mut guard = hooked.lock().unwrap();
      if let Some((old, tokens)) = guard.take() {
        let _ = old.RemoveMediaPropertiesChanged(tokens[0]);
        let _ = old.RemovePlaybackInfoChanged(tokens[1]);
        let _ = old.RemoveTimelinePropertiesChanged(tokens[2]);
      }
      match mgr.GetCurrentSession() {
        Ok(session) => {
          let emit = {
            let tsfn = tsfn.clone();
            move |s: &Session| {
              if let Ok(np) = snapshot(s) {
                if RUNNING.load(Ordering::SeqCst) {
                  tsfn.call(np, ThreadsafeFunctionCallMode::NonBlocking);
                }
              }
            }
          };
          let t0 = session.MediaPropertiesChanged(&TypedEventHandler::new({
            let emit = emit.clone();
            move |s: &Option<Session>, _| { if let Some(s) = s { emit(s) } Ok(()) }
          }))?;
          let t1 = session.PlaybackInfoChanged(&TypedEventHandler::new({
            let emit = emit.clone();
            move |s: &Option<Session>, _| { if let Some(s) = s { emit(s) } Ok(()) }
          }))?;
          let t2 = session.TimelinePropertiesChanged(&TypedEventHandler::new({
            let emit = emit.clone();
            move |s: &Option<Session>, _| { if let Some(s) = s { emit(s) } Ok(()) }
          }))?;
          emit(&session);
          *guard = Some((session, vec![t0, t1, t2]));
        }
        Err(_) => {
          tsfn.call(none_snapshot(), ThreadsafeFunctionCallMode::NonBlocking);
        }
      }
      Ok(())
    }
  };

  rehook(&manager)?;
  let rehook = Arc::new(rehook);
  {
    let rehook = rehook.clone();
    manager.CurrentSessionChanged(&TypedEventHandler::new(move |m: &Option<SessionManager>, _| {
      if let Some(m) = m { let _ = rehook(m); }
      Ok(())
    }))?;
  }

  loop {
    std::thread::sleep(std::time::Duration::from_millis(500));
  }
}

fn none_snapshot() -> NowPlaying {
  NowPlaying {
    title: String::new(), artist: String::new(), album: String::new(), art_data_url: None,
    position_ms: 0.0, duration_ms: 0.0, last_updated_ms: 0.0, rate: 1.0, status: "none".into(),
  }
}

fn snapshot(session: &Session) -> windows::core::Result<NowPlaying> {
  let media = session.TryGetMediaPropertiesAsync()?.get()?;
  let title = media.Title().unwrap_or_default().to_string();
  let artist = media.Artist().unwrap_or_default().to_string();
  let album = media.AlbumTitle().unwrap_or_default().to_string();
  let art_data_url = read_thumbnail(session).ok().flatten();

  let info = session.GetPlaybackInfo()?;
  let status = match info.PlaybackStatus()? {
    PlaybackStatus::Playing => "playing",
    PlaybackStatus::Paused => "paused",
    PlaybackStatus::Stopped | PlaybackStatus::Closed => "stopped",
    _ => "none",
  };
  let rate = info.PlaybackRate().ok().and_then(|r| r.Value().ok()).unwrap_or(1.0);

  let tl = session.GetTimelineProperties()?;
  let position_ms = (tl.Position()?.Duration as f64) / 10_000.0;
  let duration_ms = (tl.EndTime()?.Duration as f64) / 10_000.0;
  let last_updated_ms = (tl.LastUpdatedTime()?.UniversalTime as f64 - 116_444_736_000_000_000.0) / 10_000.0;

  Ok(NowPlaying {
    title, artist, album, art_data_url,
    position_ms, duration_ms, last_updated_ms, rate,
    status: status.into(),
  })
}

fn read_thumbnail(session: &Session) -> windows::core::Result<Option<String>> {
  let media = session.TryGetMediaPropertiesAsync()?.get()?;
  let Ok(reference) = media.Thumbnail() else { return Ok(None) };
  let stream = reference.OpenReadAsync()?.get()?;
  let size = stream.Size()? as u32;
  if size == 0 { return Ok(None) }
  let content_type = stream.ContentType().unwrap_or_default().to_string();
  let mime = if content_type.is_empty() { "image/jpeg".to_string() } else { content_type };
  let input = stream.GetInputStreamAt(0)?;
  let reader = DataReader::CreateDataReader(&input)?;
  reader.SetInputStreamOptions(InputStreamOptions::None)?;
  reader.LoadAsync(size)?.get()?;
  let mut buf = vec![0u8; size as usize];
  reader.ReadBytes(&mut buf)?;
  let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
  Ok(Some(format!("data:{mime};base64,{b64}")))
}
