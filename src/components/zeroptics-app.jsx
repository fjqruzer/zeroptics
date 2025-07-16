"use client"

import { useState, useRef, useEffect } from "react"
import { Upload, Camera } from "lucide-react"
import { recognizeTextFromFile } from "@/services/ocrService"
import jsPDF from "jspdf"
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf"
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"
import Typo from "typo-js"

// Helper: Convert PDF file to images (all pages)
async function pdfToImages(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const images = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const context = canvas.getContext("2d");
    await page.render({ canvasContext: context, viewport }).promise;
    // Convert canvas to blob
    const blob = await new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/png");
    });
    images.push(blob);
  }
  return images;
}

// Helper: Autocorrect text using Typo.js
function autocorrectText(text, dictionaryState) {
  if (!dictionaryState) return text;
  return text.split(/(\s+)/).map(word => {
    // Only check words (not whitespace)
    if (/^\w+$/.test(word) && !dictionaryState.check(word)) {
      const suggestions = dictionaryState.suggest(word);
      if (suggestions && suggestions.length > 0) {
        return suggestions[0];
      }
    }
    return word;
  }).join("");
}

export default function ZeropticsApp() {
  const [isHovered, setIsHovered] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const hoverTimeoutRef = useRef(null)
  const modalRef = useRef(null)
  const [ocrResult, setOcrResult] = useState("")
  const [showOcrModal, setShowOcrModal] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [showCameraModal, setShowCameraModal] = useState(false)
  const [cameraStream, setCameraStream] = useState(null)
  const videoRef = useRef(null)
  const [capturedImage, setCapturedImage] = useState(null)
  const [facingMode, setFacingMode] = useState("environment") 
  const [scannedHistory, setScannedHistory] = useState([])
  const [editableOcrText, setEditableOcrText] = useState("")
  const [historyTabPos, setHistoryTabPos] = useState({ x: 40, y: 40 })
  const [dragging, setDragging] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  // No auto-resize refs needed
  const [dictLoading, setDictLoading] = useState(true);
  const [dictionaryState, setDictionary] = useState(null);


  useEffect(() => {
    async function loadDictionary() {
      try {
        const aff = await fetch('/dictionaries/en_US.aff').then(res => res.text());
        const dic = await fetch('/dictionaries/en_US.dic').then(res => res.text());
        const TypoModule = (await import('typo-js')).default;
        setDictionary(new TypoModule("en_US", aff, dic, { platform: 'browser' }));
      } catch (e) {
        setDictionary(null);
      } finally {
        setDictLoading(false);
      }
    }
    loadDictionary();
  }, []);

  useEffect(() => {
    if (!showCameraModal && cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
  }, [showCameraModal])

  useEffect(() => {
    if (!showAbout) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") setShowAbout(false);
    }
    function handleClick(e) {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        setShowAbout(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClick);
    };
  }, [showAbout]);

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current)
      hoverTimeoutRef.current = null
    }
    setIsHovered(true)
  }

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false)
    }, 400) // 400ms timeout
  }

  const handleOcrComplete = (text, image = null) => {
    const entry = {
      id: Date.now(),
      text,
      image,
      date: new Date().toLocaleString(),
    }
    setScannedHistory((prev) => [entry, ...prev.slice(0, 19)]) // keep max 20
    setEditableOcrText(text)
  }

  const handleUploadFile = () => {
    const input = document.createElement("input")
    input.type = "file"
    input.accept = "image/*,.pdf"
    input.multiple = true
    input.onchange = async (e) => {
      const files = Array.from(e.target.files || [])
      if (files.length > 0) {
        setOcrLoading(true)
        setOcrProgress(0)
        setShowOcrModal(true)
        let lastText = ""
        for (let i = 0; i < files.length; i++) {
          let file = files[i]
          let isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf")
          try {
            if (isPdf) {
              // Convert PDF to images (all pages)
              const images = await pdfToImages(file);
              let pdfText = "";
              for (let j = 0; j < images.length; j++) {
                const text = await recognizeTextFromFile(images[j], (m) => {
                  if (m.status === "recognizing text" && m.progress) {
                    setOcrProgress(Math.round(m.progress * 100))
                  }
                });
                // Autocorrect OCR result
                const corrected = dictLoading ? text : autocorrectText(text, dictionaryState);
                handleOcrComplete(corrected);
                pdfText += corrected + (j < images.length - 1 ? "\n\n" : "");
              }
              lastText = pdfText;
            } else {
              const text = await recognizeTextFromFile(file, (m) => {
                if (m.status === "recognizing text" && m.progress) {
                  setOcrProgress(Math.round(m.progress * 100))
                }
              })
              // Autocorrect OCR result
              const corrected = dictLoading ? text : autocorrectText(text, dictionaryState)
              handleOcrComplete(corrected)
              lastText = corrected
            }
          } catch (err) {
            handleOcrComplete("Error: " + err.message)
            lastText = "Error: " + err.message
          }
        }
        setOcrResult(lastText)
        setEditableOcrText(lastText)
        setOcrLoading(false)
      }
    }
    input.click()
  }

  const handleUseCamera = () => {
    setCapturedImage(null)
    setOcrResult("")
    setOcrLoading(false)
    setOcrProgress(0)
    setShowCameraModal(true)
  }


  // Open camera stream when showCameraModal or facingMode changes
  useEffect(() => {
    if (showCameraModal) {
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode } })
        .then((stream) => {
          setCameraStream(stream)
          if (videoRef.current) {
            videoRef.current.srcObject = stream
          }
        })
        .catch((err) => {
          console.error("Camera access denied:", err)
        })
    }
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop())
      }
    }
    // eslint-disable-next-line
  }, [showCameraModal, facingMode])

  const handleCapture = () => {
    if (!videoRef.current) return
    const video = videoRef.current
    const canvas = document.createElement("canvas")
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext("2d")
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(async (blob) => {
      if (blob) {
        const imgUrl = URL.createObjectURL(blob)
        setCapturedImage(imgUrl)
        setOcrLoading(true)
        setOcrProgress(0)
        try {
          const text = await recognizeTextFromFile(blob, (m) => {
            if (m.status === "recognizing text" && m.progress) {
              setOcrProgress(Math.round(m.progress * 100))
            }
          })
          setOcrResult(text)
          handleOcrComplete(dictLoading ? text : autocorrectText(text, dictionaryState), imgUrl)
        } catch (err) {
          setOcrResult("Error: " + err.message)
          setEditableOcrText("Error: " + err.message)
        } finally {
          setOcrLoading(false)
        }
      }
    }, "image/png")
  
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop())
      setCameraStream(null)
    }
  }

  // Export OCR result as PDF
  const handleExportPdf = () => {
    const doc = new jsPDF()
    const lines = doc.splitTextToSize(editableOcrText, 180)
    doc.text(lines, 10, 10)
    doc.save("ocr-result.pdf")
  }

  const handleHistoryItemClick = (entry) => {
    setOcrResult(entry.text)
    setEditableOcrText(entry.text)
    setShowOcrModal(true)
  }

  // Drag handlers for history tab
  const handleTabMouseDown = (e) => {
    setDragging(true)
    const startX = e.type === "touchstart" ? e.touches[0].clientX : e.clientX
    const startY = e.type === "touchstart" ? e.touches[0].clientY : e.clientY
    setDragOffset({
      x: startX - historyTabPos.x,
      y: startY - historyTabPos.y,
    })
  }
  const handleTabMouseMove = (e) => {
    if (!dragging) return
    const clientX = e.type === "touchmove" ? e.touches[0].clientX : e.clientX
    const clientY = e.type === "touchmove" ? e.touches[0].clientY : e.clientY
    setHistoryTabPos({
      x: clientX - dragOffset.x,
      y: clientY - dragOffset.y,
    })
  }
  const handleTabMouseUp = () => setDragging(false)
  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleTabMouseMove)
      window.addEventListener("mouseup", handleTabMouseUp)
      window.addEventListener("touchmove", handleTabMouseMove)
      window.addEventListener("touchend", handleTabMouseUp)
    } else {
      window.removeEventListener("mousemove", handleTabMouseMove)
      window.removeEventListener("mouseup", handleTabMouseUp)
      window.removeEventListener("touchmove", handleTabMouseMove)
      window.removeEventListener("touchend", handleTabMouseUp)
    }
    return () => {
      window.removeEventListener("mousemove", handleTabMouseMove)
      window.removeEventListener("mouseup", handleTabMouseUp)
      window.removeEventListener("touchmove", handleTabMouseMove)
      window.removeEventListener("touchend", handleTabMouseUp)
    }
  }, [dragging])

  // No auto-resize effect needed

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="text-center">
        {/* Glasses Icon */}
        <div
          className="relative inline-block"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* SVG */}
          <svg
  fill="#ffffff"
  height="50px"
  width="50px"
  viewBox="0 0 32 32"
  stroke="#ffffff"
>
  <g strokeWidth="0"></g>
  <g strokeLinecap="round" strokeLinejoin="round"></g>
  <g>
    <g>
      <circle cx="16" cy="11" r="2"></circle>
      <path d="M16,2C8,2,0,4.1,0,8v16c0,2.1,2.4,3.9,6.8,5c0.3,0.1,0.6,0,0.9-0.2S8,28.3,8,28v-7.2c2.4-0.5,5.1-0.8,8-0.8
        c2.9,0,5.6,0.3,8,0.8V28c0,0.3,0.1,0.6,0.4,0.8c0.2,0.1,0.4,0.2,0.6,0.2c0.1,0,0.2,0,0.2,0c4.4-1.1,6.8-2.9,6.8-5V8
        C32,4.1,24,2,16,2z M6,26.7c-2.7-0.9-4-2-4-2.7V11c1,0.7,2.3,1.3,4,1.7V26.7z M23.8,11.6C23.6,11.8,20.3,16,16,16s-7.6-4.2-7.8-4.4
        c-0.3-0.4-0.3-0.9,0-1.2C8.4,10.2,11.7,6,16,6s7.6,4.2,7.8,4.4C24.1,10.7,24.1,11.3,23.8,11.6z M30,24c0,0.7-1.3,1.8-4,2.7V12.8
        c1.7-0.5,3-1.1,4-1.7V24z"></path>
    </g>
  </g>
</svg>

          {/* Circular Navigation  */}
          <div
            className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 transition-all duration-500 ${
              isHovered ? "opacity-100 scale-100" : "opacity-0 scale-75 pointer-events-none"
            }`}
          >
            {/* Upload File  */}
            <button
              onClick={handleUploadFile}
              className="absolute bg-slate-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 group"
              style={{
                top: "-60px",
                left: "-60px",
                transform: "translate(-50%, -50%)",
              }}
            >
              <Upload size={20} />
              <span className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 text-xs text-white bg-gray-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Upload File
              </span>
            </button>

            {/* Use Camera */}
            <button
              onClick={handleUseCamera}
              className="absolute bg-slate-600 hover:bg-green-700 text-white p-3 rounded-full shadow-lg transition-all duration-300 hover:scale-110 group"
              style={{
                top: "-60px",
                right: "-60px",
                transform: "translate(50%, -50%)",
              }}
            >
              <Camera size={20} />
              <span className="absolute top-full right-1/2 transform translate-x-1/2 mt-2 text-xs text-white bg-gray-800 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                Use Camera
              </span>
            </button>
          </div>
        </div>

        {/* Main Title */}
        <h1
          className="text-5xl md:text-6xl lg:text-7xl font-bold text-white mb-4 cursor-pointer select-none hover:text-green-600"
          onClick={() => setShowAbout(true)}
        >
          Zeroptics.
        </h1>

        {/* Subtitle */}
        <p
          className={`text-gray-400 text-md transition-opacity duration-300 ${
            isHovered ? "opacity-50" : "opacity-100"
          }`}
        >
          Hover the eye to start.
        </p>


        <div
          className={`mt-6 transition-all duration-300 ${
            isHovered ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <p className="text-gray-300 text-sm">Choose your OCR method</p>
        </div>
      </div>
      {/* footer creds */}
      <a
        href="https://tesseract-ocr.github.io"
        target="_blank"
        rel="noopener noreferrer"
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 text-gray-400 hover:text-white text-xs bg-black bg-opacity-60 px-3 py-1 rounded shadow animate-pulse hover:animate-none"
        style={{ zIndex: 50 }}
      >
        Powered by Tesseract
      </a>
      {/* Modal: About Zeroptics */}
      {showAbout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 transition-opacity">
          <div
            ref={modalRef}
            className="bg-[#18181b] border border-gray-700 rounded-lg shadow-lg p-6 min-w-[320px] max-w-xs text-green-400 font-mono text-sm relative animate-fade-in w-full h-auto sm:w-auto sm:h-auto sm:max-w-xs sm:rounded-lg sm:min-w-[320px] sm:max-h-[90vh] sm:p-6 fixed sm:static inset-0 sm:inset-auto flex flex-col justify-center overflow-visible"
            style={{ boxShadow: "0 4px 32px 0 #000a" }}
          >
            <div className="mb-2 text-green-500">$ Zeroptics --about</div>
            <div className="whitespace-pre-line text-green-300">
              Zeroptics is a lightweight OCR app by Zero One that converts images to text using Tesseract.\nFast, accurate, and built for clarity.
            </div>
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-green-400 text-lg focus:outline-none z-10"
              onClick={() => setShowAbout(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Modal: OCR Result */}
      {showOcrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 transition-opacity">
          <div
            className="bg-[#18181b] border border-gray-700 rounded-lg shadow-lg p-6 min-w-[320px] max-w-lg w-full sm:w-auto text-green-400 font-mono text-sm relative animate-fade-in flex flex-col sm:max-w-lg sm:rounded-lg sm:p-6 fixed sm:static inset-0 sm:inset-auto justify-center overflow-visible min-h-[200px] max-h-[90vh]"
            style={{ boxShadow: "0 4px 32px 0 #000a" }}
          >
            <div className="mb-2 text-green-500">$ Zeroptics --ocr-result</div>
            <div className="whitespace-pre-line text-green-300 min-h-[100px] overflow-auto" style={{ maxHeight: "100vh" }}>
              {ocrLoading ? (
                <>
                  <div>Recognizing text...</div>
                  <div className="w-full bg-gray-800 rounded h-2 mt-2 mb-2">
                    <div
                      className="bg-green-500 h-2 rounded"
                      style={{ width: `${ocrProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-xs text-gray-400">{ocrProgress}%</div>
                </>
              ) : (
                <>
                  <textarea
                    className="w-full min-h-[380px] max-h-[60vh] bg-black text-green-300 border border-green-700 rounded p-2 font-mono resize-vertical focus:outline-none focus:ring-2 focus:ring-green-600 overflow-auto"
                    value={editableOcrText}
                    onChange={e => setEditableOcrText(e.target.value)}
                    style={{ maxHeight: '60vh', fontSize: '16px' }}
                    disabled={ocrLoading}
                  />
                </>
              )}
            </div>
            {/* Export as PDF button */}
            {!ocrLoading && editableOcrText && (
              <button
                className="mt-4 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded shadow transition-all duration-200"
                onClick={handleExportPdf}
              >
                Export as PDF
              </button>
            )}
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-green-400 text-lg focus:outline-none z-10"
              onClick={() => setShowOcrModal(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Modal: Camera Terminal */}
      {showCameraModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-80 transition-opacity">
          <div
            className="bg-[#18181b] border border-green-700 rounded-lg shadow-lg p-6 min-w-[320px] max-w-lg w-full sm:w-auto text-green-400 font-mono text-sm relative animate-fade-in flex flex-col items-center w-full h-full sm:h-auto sm:w-auto sm:max-w-lg sm:rounded-lg sm:p-6 fixed sm:static inset-0 sm:inset-auto justify-center overflow-visible"
            style={{ boxShadow: "0 4px 32px 0 #000a", maxHeight: "90vh" }}
          >
            <div className="mb-2 text-green-500 w-full">$ Zeroptics --camera</div>
            {!capturedImage && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="rounded border border-green-700 bg-black mb-4 w-full max-h-64 object-contain"
                  style={{ background: "#000", minHeight: "180px" }}
                />
                <button
                  className="bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded shadow transition-all duration-200 font-mono text-base w-full mb-2 border border-gray-500"
                  onClick={() => setFacingMode((prev) => (prev === "user" ? "environment" : "user"))}
                >
                  Flip Camera
                </button>
                <button
                  className="bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded shadow transition-all duration-200 font-mono text-base w-full mb-2 border border-green-500"
                  onClick={handleCapture}
                >
                  Capture
                </button>
              </>
            )}
            {/* Show captured image and OCR result */}
            {capturedImage && (
              <>
                <img
                  src={capturedImage}
                  alt="Captured"
                  className="rounded border border-green-700 bg-black mb-4 w-full max-h-64 object-contain"
                  style={{ background: "#000" }}
                />
                <div className="whitespace-pre-line text-green-300 min-h-[80px] overflow-auto w-full" style={{ maxHeight: "30vh" }}>
                  {ocrLoading ? (
                    <>
                      <div>Recognizing text...</div>
                      <div className="w-full bg-gray-800 rounded h-2 mt-2 mb-2">
                        <div
                          className="bg-green-500 h-2 rounded"
                          style={{ width: `${ocrProgress}%` }}
                        ></div>
                      </div>
                      <div className="text-xs text-gray-400">{ocrProgress}%</div>
                    </>
                  ) : (
                    ocrResult || "No text found."
                  )}
                </div>
                {/* Export as PDF button */}
                {!ocrLoading && ocrResult && (
                  <button
                    className="mt-4 bg-green-700 hover:bg-green-800 text-white px-4 py-2 rounded shadow transition-all duration-200 w-full border border-green-500"
                    onClick={handleExportPdf}
                  >
                    Export as PDF
                  </button>
                )}
              </>
            )}
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-green-400 text-lg focus:outline-none z-10"
              onClick={() => setShowCameraModal(false)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        </div>
      )}
      {/* Floating, moveable scanned history tab */}
      <div
        className="fixed z-50 bg-[#18181b] border border-green-700 rounded-lg shadow-lg p-2 text-green-300 font-mono text-xs cursor-move select-none opacity-50 hover:opacity-100 transition-opacity duration-300"
        style={{ left: historyTabPos.x, top: historyTabPos.y, minWidth: 180, maxWidth: 260, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 32px 0 #000a' }}
        onMouseDown={handleTabMouseDown}
        onTouchStart={handleTabMouseDown}
      >
        <div className="font-bold text-green-500 mb-1">History</div>
        {scannedHistory.length === 0 ? (
          <div className="text-gray-400">No scans yet.</div>
        ) : (
          scannedHistory.map(entry => (
            <div
              key={entry.id}
              className="flex items-center gap-2 p-1 rounded hover:bg-green-900 cursor-pointer mb-1"
              onClick={e => { e.stopPropagation(); handleHistoryItemClick(entry) }}
              style={{ wordBreak: 'break-all' }}
            >
              {entry.image && (
                <img src={entry.image} alt="thumb" className="w-6 h-6 object-cover rounded border border-green-700" />
              )}
              <div className="flex-1">
                <div className="truncate max-w-[120px]">{entry.text.slice(0, 30) || 'No text'}</div>
                <div className="text-gray-500 text-[10px]">{entry.date}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
