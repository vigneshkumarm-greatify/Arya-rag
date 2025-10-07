/**
 * Fact Extraction Service
 * 
 * Extracts specific facts, values, definitions, and measurements from text.
 * Critical for retrieving "minute details" that can get lost in large chunks.
 * 
 * Extraction Categories:
 * - Measurements & Values (±0.05mm, 25°C, 5kg, etc.)
 * - Dates & Times
 * - Definitions & Terms
 * - Requirements & Specifications
 * - Procedures & Steps
 * - References & Citations
 * 
 * @author ARYA RAG Team
 */

import { LLMServiceFactory } from '../llm/LLMServiceFactory';
import { LLMService } from '../llm/LLMService';

/**
 * Structured fact representation
 */
export interface ExtractedFact {
  type: FactType;
  value: string;
  unit?: string;
  context?: string;
  confidence: number;
  position: {
    start: number;
    end: number;
  };
}

export type FactType = 
  | 'measurement'
  | 'date'
  | 'time'
  | 'definition'
  | 'requirement'
  | 'procedure'
  | 'reference'
  | 'specification'
  | 'tolerance'
  | 'temperature'
  | 'pressure'
  | 'dimension';

/**
 * Extraction result with structured facts
 */
export interface FactExtractionResult {
  facts: ExtractedFact[];
  totalFacts: number;
  factsByType: Map<FactType, ExtractedFact[]>;
  processingTime: number;
}

export class FactExtractionService {
  private llmService?: LLMService;
  
  /**
   * Regex patterns for fact extraction
   */
  private patterns = {
    // Measurements: "±0.05mm", "25.5kg", "100-200m", "5.2±0.1"
    measurement: /([±]?\d+\.?\d*)\s*([±]?\d+\.?\d*)?\s*(mm|cm|m|km|kg|g|mg|l|ml|Hz|kHz|MHz|GHz|V|A|W|kW|MW|Pa|kPa|MPa|bar|psi|N|kN|lb|ft|in|yd|mi|gal|qt|pt|oz)\b/gi,
    
    // Tolerance: "±0.05", "± 0.1mm", "+/-0.2"
    tolerance: /([±+/-]\s*\d+\.?\d*)\s*(mm|cm|m|%|°|degrees?)?/gi,
    
    // Temperature: "25°C", "77°F", "-10 degrees", "298K"
    temperature: /(-?\d+\.?\d*)\s*°?\s*(C|F|K|celsius|fahrenheit|kelvin)\b/gi,
    
    // Pressure: "100 psi", "5 bar", "1.5 MPa"
    pressure: /(\d+\.?\d*)\s*(psi|bar|Pa|kPa|MPa|atm|torr)\b/gi,
    
    // Dimensions: "5x10x15mm", "10cm x 20cm"
    dimension: /(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)\s*([xX×]\s*\d+\.?\d*)?\s*(mm|cm|m|in|ft)?/gi,
    
    // Dates: "2024-01-15", "15 Jan 2024", "01/15/2024"
    date: /\b(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})\b/gi,
    
    // Time: "14:30:00", "2:30 PM", "1430 hours"
    time: /\b(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?|\d{4}\s*hours?)\b/gi,
    
    // Requirements: "shall", "must", "required", "mandatory"
    requirement: /\b(shall|must|required|mandatory|obligatory|compulsory|essential)\b/gi,
    
    // Definitions: "is defined as", "means", "refers to", "is/are"
    definition: /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(is|are|means?|refers?\s+to|defined\s+as)\s+([^.!?]+)/gi,
    
    // Section references: "Section 1.2.3", "paragraph 5", "see 3.4"
    reference: /(?:section|paragraph|para\.?|clause|chapter|appendix|fig(?:ure)?\.?|table)\s+(\d+(?:\.\d+)*)/gi,
    
    // Ranges: "10-20", "between 5 and 10", "5 to 10"
    range: /(?:between\s+)?(\d+\.?\d*)\s*(?:to|and|-|–|—)\s*(\d+\.?\d*)/gi
  };

  constructor() {
    // LLM service optional, for advanced extraction
    try {
      this.llmService = LLMServiceFactory.createFromEnvironment();
    } catch (error) {
      console.warn('⚠️  LLM service not available for advanced fact extraction');
    }
  }

  /**
   * Extract all facts from text
   */
  async extractFacts(
    text: string,
    options: {
      useLLM?: boolean;
      minConfidence?: number;
    } = {}
  ): Promise<FactExtractionResult> {
    const startTime = Date.now();
    const facts: ExtractedFact[] = [];
    
    // Extract using regex patterns
    facts.push(...this.extractMeasurements(text));
    facts.push(...this.extractTolerances(text));
    facts.push(...this.extractTemperatures(text));
    facts.push(...this.extractPressures(text));
    facts.push(...this.extractDimensions(text));
    facts.push(...this.extractDates(text));
    facts.push(...this.extractTimes(text));
    facts.push(...this.extractRequirements(text));
    facts.push(...this.extractDefinitions(text));
    facts.push(...this.extractReferences(text));
    facts.push(...this.extractRanges(text));
    
    // Use LLM for advanced extraction (optional)
    if (options.useLLM && this.llmService && text.length > 100) {
      try {
        const llmFacts = await this.extractWithLLM(text);
        facts.push(...llmFacts);
      } catch (error) {
        console.warn('LLM fact extraction failed:', error);
      }
    }
    
    // Filter by confidence threshold
    const minConfidence = options.minConfidence || 0.5;
    const filteredFacts = facts.filter(f => f.confidence >= minConfidence);
    
    // Group by type
    const factsByType = new Map<FactType, ExtractedFact[]>();
    filteredFacts.forEach(fact => {
      if (!factsByType.has(fact.type)) {
        factsByType.set(fact.type, []);
      }
      factsByType.get(fact.type)!.push(fact);
    });
    
    const processingTime = Date.now() - startTime;
    
    return {
      facts: filteredFacts,
      totalFacts: filteredFacts.length,
      factsByType,
      processingTime
    };
  }

  /**
   * Extract measurements from text
   */
  private extractMeasurements(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.measurement.lastIndex = 0;
    while ((match = this.patterns.measurement.exec(text)) !== null) {
      const value = match[1];
      const tolerance = match[2];
      const unit = match[3];
      
      facts.push({
        type: 'measurement',
        value: tolerance ? `${value}±${tolerance}` : value,
        unit,
        context: this.extractContext(text, match.index, 50),
        confidence: 0.9,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract tolerances from text
   */
  private extractTolerances(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.tolerance.lastIndex = 0;
    while ((match = this.patterns.tolerance.exec(text)) !== null) {
      facts.push({
        type: 'tolerance',
        value: match[1],
        unit: match[2],
        context: this.extractContext(text, match.index, 50),
        confidence: 0.85,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract temperatures from text
   */
  private extractTemperatures(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.temperature.lastIndex = 0;
    while ((match = this.patterns.temperature.exec(text)) !== null) {
      facts.push({
        type: 'temperature',
        value: match[1],
        unit: match[2],
        context: this.extractContext(text, match.index, 50),
        confidence: 0.9,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract pressures from text
   */
  private extractPressures(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.pressure.lastIndex = 0;
    while ((match = this.patterns.pressure.exec(text)) !== null) {
      facts.push({
        type: 'pressure',
        value: match[1],
        unit: match[2],
        context: this.extractContext(text, match.index, 50),
        confidence: 0.9,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract dimensions from text
   */
  private extractDimensions(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.dimension.lastIndex = 0;
    while ((match = this.patterns.dimension.exec(text)) !== null) {
      facts.push({
        type: 'dimension',
        value: match[0].replace(/\s+/g, ''),
        unit: match[4],
        context: this.extractContext(text, match.index, 50),
        confidence: 0.85,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract dates from text
   */
  private extractDates(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.date.lastIndex = 0;
    while ((match = this.patterns.date.exec(text)) !== null) {
      facts.push({
        type: 'date',
        value: match[1],
        context: this.extractContext(text, match.index, 50),
        confidence: 0.8,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract times from text
   */
  private extractTimes(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.time.lastIndex = 0;
    while ((match = this.patterns.time.exec(text)) !== null) {
      facts.push({
        type: 'time',
        value: match[1],
        context: this.extractContext(text, match.index, 50),
        confidence: 0.75,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract requirements from text
   */
  private extractRequirements(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.requirement.lastIndex = 0;
    while ((match = this.patterns.requirement.exec(text)) !== null) {
      // Get the full sentence containing the requirement
      const sentence = this.extractSentence(text, match.index);
      
      facts.push({
        type: 'requirement',
        value: match[1],
        context: sentence,
        confidence: 0.7,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract definitions from text
   */
  private extractDefinitions(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.definition.lastIndex = 0;
    while ((match = this.patterns.definition.exec(text)) !== null) {
      const term = match[1];
      const definition = match[3].trim();
      
      facts.push({
        type: 'definition',
        value: term,
        context: definition,
        confidence: 0.8,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract references from text
   */
  private extractReferences(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.reference.lastIndex = 0;
    while ((match = this.patterns.reference.exec(text)) !== null) {
      facts.push({
        type: 'reference',
        value: match[1],
        context: match[0],
        confidence: 0.9,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract ranges from text
   */
  private extractRanges(text: string): ExtractedFact[] {
    const facts: ExtractedFact[] = [];
    let match;
    
    this.patterns.range.lastIndex = 0;
    while ((match = this.patterns.range.exec(text)) !== null) {
      facts.push({
        type: 'specification',
        value: `${match[1]}-${match[2]}`,
        context: this.extractContext(text, match.index, 50),
        confidence: 0.75,
        position: {
          start: match.index,
          end: match.index + match[0].length
        }
      });
    }
    
    return facts;
  }

  /**
   * Extract context around a position
   */
  private extractContext(text: string, position: number, radius: number): string {
    const start = Math.max(0, position - radius);
    const end = Math.min(text.length, position + radius);
    return text.substring(start, end).trim();
  }

  /**
   * Extract full sentence containing position
   */
  private extractSentence(text: string, position: number): string {
    // Find sentence boundaries
    const before = text.substring(0, position);
    const after = text.substring(position);
    
    const sentenceStart = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      0
    );
    
    const sentenceEnd = Math.min(
      after.search(/[.!?]/),
      after.length
    );
    
    return text.substring(sentenceStart, position + sentenceEnd).trim();
  }

  /**
   * Use LLM to extract complex facts
   */
  private async extractWithLLM(text: string): Promise<ExtractedFact[]> {
    if (!this.llmService) return [];
    
    // Limit text length for LLM
    const maxLength = 2000;
    const truncatedText = text.length > maxLength 
      ? text.substring(0, maxLength) + '...' 
      : text;
    
    const prompt = `Extract specific facts, measurements, requirements, and definitions from the following text.
Focus on:
- Exact measurements and tolerances
- Technical specifications
- Requirements (shall, must, required)
- Key definitions

Text: ${truncatedText}

Return a JSON array of facts with structure: {"type": "measurement|requirement|definition", "value": "...", "context": "..."}`;

    try {
      const response = await this.llmService.generateCompletion({
        prompt,
        maxTokens: 500,
        temperature: 0.1
      });
      
      // Parse JSON response
      const jsonMatch = response.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedFacts = JSON.parse(jsonMatch[0]);
        return parsedFacts.map((f: any) => ({
          type: f.type as FactType,
          value: f.value,
          context: f.context,
          confidence: 0.7, // Lower confidence for LLM extraction
          position: { start: 0, end: 0 }
        }));
      }
    } catch (error) {
      console.warn('LLM fact extraction failed:', error);
    }
    
    return [];
  }

  /**
   * Get statistics about extracted facts
   */
  getStatistics(result: FactExtractionResult): {
    totalFacts: number;
    factTypes: Record<string, number>;
    avgConfidence: number;
  } {
    const factTypes: Record<string, number> = {};
    let totalConfidence = 0;
    
    result.facts.forEach(fact => {
      factTypes[fact.type] = (factTypes[fact.type] || 0) + 1;
      totalConfidence += fact.confidence;
    });
    
    return {
      totalFacts: result.totalFacts,
      factTypes,
      avgConfidence: result.facts.length > 0 
        ? totalConfidence / result.facts.length 
        : 0
    };
  }
}

